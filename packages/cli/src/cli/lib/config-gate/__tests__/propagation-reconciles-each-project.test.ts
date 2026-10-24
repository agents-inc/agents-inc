/**
 * What a global change leaves in each registered project's own `config.ts`: the masks, the stack
 * and the types, read back structurally, plus the verbose line each fan-out outcome prints.
 */

import path from "path";
import { readFile, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfig } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildSourceConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeRawTestConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { renderUnparseableConfigTs } from "../../__tests__/factories/unloadable-config-factories.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { silenceConsole } from "../../__tests__/helpers/silence-console.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
import { sa } from "../../__tests__/factories/skill-factories.js";
import { ensureBlankPair } from "../pair-writer.js";
import { withGateToken } from "../gate-token.js";
import { cleanupTempDir, createTempDir, fileExists } from "../../__tests__/test-fs-utils.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { matrix } from "../../matrix/matrix-provider.js";
import { setVerbose } from "../../../utils/logger.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE, STANDARD_FILES } from "../../../consts.js";
import {
  buildProjectTypesExtras,
  projectsAFanOutReaches,
  propagateGlobalChangesToProjects,
  reconcileProjectSplitAgainstGlobal,
  resolveEffectiveGlobalConfig,
  writeProjectConfigPair,
} from "../propagate.js";

const REACT = "web-framework-react";
const VUE = "web-framework-vue-composition-api";
const VITEST = "web-testing-vitest";
const HONO = "api-framework-hono";
const WEB_DEVELOPER = "web-developer";
const API_DEVELOPER = "api-developer";
const CLI_DEVELOPER = "cli-developer";

/** No agent definitions: nothing below reads a compiled body, and the fan-out takes the map. */
const NO_AGENTS = {};

const CODEX_SOURCE_REL = ".agents-inc/codex";

const MISSING_MARKETPLACE = "/no/such/project/marketplace";

/** A marketplace other than the one a project's mask recorded. */
const OTHER_MARKETPLACE = "acme-internal";

/** A model the global install sets on a sub-agent after a project masked it. */
const GLOBAL_MODEL = "opus";

/** How a project's types file opens its category union over the global one. */
const PROJECT_CATEGORY_UNION = "export type Category = GlobalCategory | ";

describe("a global change propagated into a registered project", () => {
  const consoleSpies = silenceConsole(["log"]);
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-propagation-reconciles-");
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  async function registerProject(name: string, config: ProjectConfig): Promise<string> {
    const dir = path.join(tempDir, name);
    await writeTestTsConfig(dir, config);
    return realpath(dir);
  }

  function globalInstall(overrides: Partial<ProjectConfig>): ProjectConfig {
    return buildProjectConfig({ name: "global-install", skills: [], agents: [], ...overrides });
  }

  async function projectConfigOf(project: string): Promise<ProjectConfig | undefined> {
    return (await loadProjectConfigFromDir(project, "claude"))?.config;
  }

  it("prunes what the global install dropped from a project sub-agent's stack, and only that", async () => {
    const project = await registerProject(
      "pruned",
      buildProjectConfig({
        name: "pruned",
        skills: [
          buildSkillConfig(REACT, { scope: "global" }),
          buildSkillConfig(VITEST, { scope: "global" }),
          buildSkillConfig(HONO, { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
          ...buildAgentConfigs([API_DEVELOPER, CLI_DEVELOPER], { scope: "project" }),
        ],
        stack: {
          [API_DEVELOPER]: {
            "api-api": [{ id: HONO, preloaded: false }],
            "web-framework": [{ id: REACT, preloaded: false }],
            "web-testing": [{ id: VITEST, preloaded: false }],
          },
          [CLI_DEVELOPER]: { "web-testing": [{ id: VITEST, preloaded: false }] },
        },
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        skills: [
          buildSkillConfig(REACT, { scope: "global" }),
          buildSkillConfig(VITEST, { scope: "global", excluded: true }),
        ],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.stack).toStrictEqual({
      [API_DEVELOPER]: {
        "web-framework": [{ id: REACT, preloaded: false }],
        "api-api": [{ id: HONO, preloaded: false }],
      },
    });
  });

  it("keeps a skill in the stack that the project owns itself, whatever the global install did", async () => {
    const project = await registerProject(
      "owned",
      buildProjectConfig({
        name: "owned",
        skills: [
          buildSkillConfig(VITEST, { scope: "global" }),
          buildSkillConfig(VITEST, { scope: "project" }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        stack: { [API_DEVELOPER]: { "web-testing": [{ id: VITEST, preloaded: false }] } },
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({ projects: [project] }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.stack).toStrictEqual({
      [API_DEVELOPER]: { "web-testing": [{ id: VITEST, preloaded: false }] },
    });
  });

  it("drops the project's mask of a skill the global install no longer has active", async () => {
    const project = await registerProject(
      "unmasked",
      buildProjectConfig({
        name: "unmasked",
        skills: [
          buildSkillConfig(REACT, { scope: "global", excluded: true }),
          buildSkillConfig(VUE, { scope: "project" }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        skills: [
          buildSkillConfig(REACT, { scope: "global", excluded: true }),
          buildSkillConfig(HONO, { scope: "global" }),
        ],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.skills).toStrictEqual([
      buildSkillConfig(REACT, { scope: "global", excluded: true }),
      buildSkillConfig(HONO, { scope: "global" }),
      buildSkillConfig(VUE, { scope: "project" }),
    ]);
  });

  it("drops the project's mask of a sub-agent the global install no longer has active", async () => {
    const project = await registerProject(
      "unmasked-agent",
      buildProjectConfig({
        name: "unmasked-agent",
        skills: [],
        agents: [
          ...buildAgentConfigs([API_DEVELOPER], { scope: "global", excluded: true }),
          ...buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        ],
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        agents: [
          ...buildAgentConfigs([API_DEVELOPER], { scope: "global", excluded: true }),
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        ],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.agents).toStrictEqual([
      ...buildAgentConfigs([API_DEVELOPER], { scope: "global", excluded: true }),
      ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      ...buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
    ]);
  });

  it("keeps the origin its mask of a skill recorded, though the global install now takes it from another marketplace", async () => {
    const project = await registerProject(
      "masked-origin",
      buildProjectConfig({
        name: "masked-origin",
        skills: [
          buildSkillConfig(REACT, { scope: "project", origin: EJECT_SOURCE }),
          buildSkillConfig(REACT, {
            scope: "global",
            origin: DEFAULT_PUBLIC_SOURCE_NAME,
            excluded: true,
          }),
        ],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        skills: [buildSkillConfig(REACT, { scope: "global", origin: OTHER_MARKETPLACE })],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.skills).toStrictEqual([
      buildSkillConfig(REACT, {
        scope: "global",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
        excluded: true,
      }),
      buildSkillConfig(REACT, { scope: "project", origin: EJECT_SOURCE }),
    ]);
  });

  it("carries the name a global entry records into each registered project, and onto the mask it spreads from that entry", async () => {
    const project = await registerProject(
      "named",
      buildProjectConfig({
        name: "named",
        skills: [buildSkillConfig(REACT, { scope: "project" })],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        skills: [
          buildSkillConfig(REACT, {
            scope: "global",
            origin: OTHER_MARKETPLACE,
            displayName: "Acme React",
          }),
          buildSkillConfig(HONO, {
            scope: "global",
            origin: OTHER_MARKETPLACE,
            displayName: "Acme Hono",
          }),
        ],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect(
      (await projectConfigOf(project))?.skills,
      "the inlined global entry and the mask the project's own React leaves over it both keep the name",
    ).toStrictEqual([
      buildSkillConfig(HONO, {
        scope: "global",
        origin: OTHER_MARKETPLACE,
        displayName: "Acme Hono",
      }),
      buildSkillConfig(REACT, {
        scope: "global",
        origin: OTHER_MARKETPLACE,
        displayName: "Acme React",
        excluded: true,
      }),
      buildSkillConfig(REACT, { scope: "project" }),
    ]);
  });

  it("keeps its mask of a sub-agent as recorded, though the global install's entry now carries a model", async () => {
    const project = await registerProject(
      "masked-model",
      buildProjectConfig({
        name: "masked-model",
        skills: [],
        agents: [
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global", excluded: true }),
        ],
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        agents: [
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global", model: GLOBAL_MODEL }),
          ...buildAgentConfigs([API_DEVELOPER], { scope: "global" }),
        ],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    expect((await projectConfigOf(project))?.agents).toStrictEqual([
      ...buildAgentConfigs([API_DEVELOPER], { scope: "global" }),
      ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global", excluded: true }),
      ...buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
    ]);
  });

  it("leaves out of the project's regenerated types a category the global install's removal emptied", async () => {
    await withGateToken(() => ensureBlankPair("claude"));
    const project = await registerProject(
      "emptied-category",
      buildProjectConfig({
        name: "emptied-category",
        skills: [
          buildSkillConfig(REACT, { scope: "global" }),
          buildSkillConfig(VITEST, { scope: "global" }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        stack: {
          [API_DEVELOPER]: {
            "web-framework": [{ id: REACT, preloaded: false }],
            "web-testing": [{ id: VITEST, preloaded: false }],
          },
        },
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({
        skills: [buildSkillConfig(REACT, { scope: "global" })],
        projects: [project],
      }),
      NO_AGENTS,
      "claude",
    );

    const types = await readFile(
      path.join(
        path.dirname(getProjectConfigPath(project, "claude")),
        STANDARD_FILES.CONFIG_TYPES_TS,
      ),
      "utf-8",
    );
    expect(types).toContain(`${PROJECT_CATEGORY_UNION}'web-framework'\n`);
  });

  it("regenerates the project's types, unless told that no union moved", async () => {
    const regenerated = await registerProject("regenerated", buildProjectConfig({ name: "r" }));
    const untouched = await registerProject("untouched", buildProjectConfig({ name: "u" }));

    await propagateGlobalChangesToProjects(
      globalInstall({ projects: [regenerated] }),
      NO_AGENTS,
      "claude",
    );
    await propagateGlobalChangesToProjects(
      globalInstall({ projects: [untouched] }),
      NO_AGENTS,
      "claude",
      undefined,
      { regenerateTypes: false },
    );

    const typesOf = (project: string) =>
      path.join(
        path.dirname(getProjectConfigPath(project, "claude")),
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
    expect(await fileExists(typesOf(regenerated))).toBe(true);
    expect(await fileExists(typesOf(untouched))).toBe(false);
  });

  it("names in the project's regenerated types a category only the global stack holds", async () => {
    await withGateToken(() => ensureBlankPair("claude"));
    const project = await registerProject("stacked", buildProjectConfig({ name: "stacked" }));

    await propagateGlobalChangesToProjects(
      globalInstall({
        projects: [project],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        stack: { [WEB_DEVELOPER]: { "web-testing": [sa(VITEST)] } },
      }),
      NO_AGENTS,
      "claude",
    );

    const types = await readFile(
      path.join(
        path.dirname(getProjectConfigPath(project, "claude")),
        STANDARD_FILES.CONFIG_TYPES_TS,
      ),
      "utf-8",
    );
    expect(types).toContain("'web-testing'");
  });

  it("names in the project's regenerated types a category only its own stack holds", async () => {
    await withGateToken(() => ensureBlankPair("claude"));
    const project = await registerProject(
      "own-stack",
      buildProjectConfig({
        name: "own-stack",
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
        stack: { [WEB_DEVELOPER]: { "web-testing": [sa(VITEST)] } },
      }),
    );

    await propagateGlobalChangesToProjects(
      globalInstall({ projects: [project] }),
      NO_AGENTS,
      "claude",
    );

    const types = await readFile(
      path.join(
        path.dirname(getProjectConfigPath(project, "claude")),
        STANDARD_FILES.CONFIG_TYPES_TS,
      ),
      "utf-8",
    );
    expect(types).toContain("'web-testing'");
  });

  it("names each registered project's outcome on the verbose channel", async () => {
    const updated = await registerProject("updated", buildProjectConfig({ name: "updated" }));
    const failing = await registerProject(
      "failing",
      buildProjectConfig({
        name: "failing",
        ...buildSourceConfig({ marketplace: MISSING_MARKETPLACE }),
      }),
    );
    const otherProvider = path.join(tempDir, "other-provider");
    await writeTestTsConfig(otherProvider, buildProjectConfig({ name: "other" }), CODEX_SOURCE_REL);
    const notOurs = await realpath(otherProvider);
    const gone = path.join(tempDir, "gone");

    const result = await propagateGlobalChangesToProjects(
      globalInstall({ projects: [updated, failing, notOurs, gone] }),
      NO_AGENTS,
      "claude",
    );

    expect(result).toStrictEqual({
      updated: [updated],
      unreadable: [],
      gone: [gone],
      notOurs: [notOurs],
      failed: [failing],
    });
    expect(consoleSpies.log).toHaveBeenCalledWith(`  Propagated global changes to ${updated}`);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `  Failed to propagate to ${failing}: Local marketplace not found: '${MISSING_MARKETPLACE}'`,
      ),
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Skipped propagation to ${notOurs} (not a claude installation)`,
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Skipped propagation to ${gone} (nothing installed there)`,
    );
  });

  it("names before a fan-out the projects it rewrites, and none it then skips", async () => {
    const reached = await registerProject("reached", buildProjectConfig({ name: "reached" }));
    const unreadableDir = path.join(tempDir, "unreadable");
    await writeRawTestConfig(unreadableDir, renderUnparseableConfigTs());
    const unreadable = await realpath(unreadableDir);
    const otherProvider = path.join(tempDir, "other-provider");
    await writeTestTsConfig(otherProvider, buildProjectConfig({ name: "other" }), CODEX_SOURCE_REL);
    const notOurs = await realpath(otherProvider);
    const gone = path.join(tempDir, "gone");
    const projects = [reached, unreadable, notOurs, gone];

    const named = await projectsAFanOutReaches(projects, "claude");
    const result = await propagateGlobalChangesToProjects(
      globalInstall({ projects }),
      NO_AGENTS,
      "claude",
    );

    expect(named).toStrictEqual([reached]);
    expect(result).toStrictEqual({
      updated: named,
      unreadable: [unreadable],
      gone: [gone],
      notOurs: [notOurs],
      failed: [],
    });
  });
});

describe("the single project pair writer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-pair-writer-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  it("names the installation it found when refusing a pair aimed at another provider", async () => {
    const dir = path.join(tempDir, "claude-project");
    await writeTestTsConfig(dir, buildProjectConfig({ name: "claude-project" }));
    const project = await realpath(dir);

    await expect(
      writeProjectConfigPair(
        project,
        "codex",
        buildProjectConfig({ name: "claude-project" }),
        buildProjectConfig({ name: "global-install" }),
        matrix,
        NO_AGENTS,
      ),
    ).rejects.toThrow(
      `Refusing to write ${getProjectConfigPath(project, "codex")}: ${project} holds the claude installation at ${path.join(project, ".agents-inc", "claude")}, not a codex one.`,
    );
  });

  it("leaves the types file alone when told no union moved", async () => {
    const dir = path.join(tempDir, "claude-project");
    await writeTestTsConfig(dir, buildProjectConfig({ name: "claude-project" }));
    const project = await realpath(dir);

    await writeProjectConfigPair(
      project,
      "claude",
      buildProjectConfig({ name: "claude-project" }),
      buildProjectConfig({ name: "global-install", skills: [], agents: [] }),
      matrix,
      NO_AGENTS,
      { regenerateTypes: false },
    );

    expect(
      await fileExists(path.join(project, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TYPES_TS)),
    ).toBe(false);
  });
});

describe("reconcileProjectSplitAgainstGlobal", () => {
  it("keeps a project entry that masks nothing, including one the project excluded", () => {
    const split = buildProjectConfig({
      skills: [
        buildSkillConfig(HONO, { scope: "project" }),
        buildSkillConfig(VITEST, { scope: "project", excluded: true }),
      ],
      agents: [
        ...buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        ...buildAgentConfigs([CLI_DEVELOPER], { scope: "project", excluded: true }),
      ],
    });

    const reconciled = reconcileProjectSplitAgainstGlobal(
      split,
      buildProjectConfig({ skills: [], agents: [] }),
      matrix,
    );

    expect({ skills: reconciled.skills, agents: reconciled.agents }).toStrictEqual({
      skills: split.skills,
      agents: split.agents,
    });
  });
});

describe("resolveEffectiveGlobalConfig for a project already registered", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-effective-global-unchanged-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("reports nothing changed when the session adds nothing and the registration stands", async () => {
    const dir = path.join(tempDir, "project");
    await writeTestTsConfig(dir, buildProjectConfig({ name: "project" }));
    const project = await realpath(dir);
    const installed = buildProjectConfig({
      name: "global-install",
      skills: [buildSkillConfig(REACT, { scope: "global" })],
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      projects: [project],
    });

    const { changed, globalDataChanged } = await resolveEffectiveGlobalConfig(
      buildProjectConfig({
        name: "global-install",
        skills: [buildSkillConfig(REACT, { scope: "global" })],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      }),
      installed,
      project,
    );

    expect({ changed, globalDataChanged }).toStrictEqual({
      changed: false,
      globalDataChanged: false,
    });
  });
});

describe("buildProjectTypesExtras", () => {
  it("contributes only the active skills and sub-agents, and only the domains they imply", () => {
    const extras = buildProjectTypesExtras(
      buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(HONO, { scope: "global", excluded: true }),
        ],
        agents: [
          ...buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
          ...buildAgentConfigs([API_DEVELOPER], { scope: "global", excluded: true }),
        ],
      }),
      matrix,
    );

    expect(extras).toStrictEqual({
      extraSkillIds: [REACT],
      extraAgentNames: [WEB_DEVELOPER],
      extraCategories: ["web-framework"],
      extraDomains: ["web"],
    });
  });
});
