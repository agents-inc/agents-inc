/**
 * What each gate entry point writes, propagates and reports for one change, with the verbose line
 * each branch prints. Projects and the global install are real configs under a fake home.
 */

import path from "path";
import { chmod, mkdir, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectConfig } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { silenceConsole } from "../../__tests__/helpers/silence-console.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
import {
  directoryExists,
  cleanupTempDir,
  createTempDir,
  fileExists,
} from "../../__tests__/test-fs-utils.js";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "../../__tests__/fixtures/create-test-source.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { matrix } from "../../matrix/matrix-provider.js";
import { setVerbose } from "../../../utils/logger.js";
import { STANDARD_FILES } from "../../../consts.js";
import {
  GlobalPairWriteViolation,
  mutateGlobal,
  propagateGlobalRemoval,
  reconcileTypesFromDisk,
  writeConfigByScope,
  writeProjectPartial,
  writeScopeConfigTypes,
} from "../index.js";

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const WEB_DEVELOPER = "web-developer";
const API_DEVELOPER = "api-developer";

const NO_AGENTS = {};

const NOTHING_PROPAGATED = { updated: [], unreadable: [], gone: [], notOurs: [], failed: [] };

const UNOPENABLE_FILE = 0o000;
const READ_WRITE_FILE = 0o644;

describe("the config gate's entry points", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-gate-consequences-");
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTempDir(tempDir);
  });

  // After the hook that creates the directory: hooks run in order, and the code under test reads HOME.
  const home = useFakeHome(() => tempDir);

  function said(line: string): void {
    expect(consoleSpies.log).toHaveBeenCalledWith(`  ${line}`);
  }

  async function installProject(name: string, config?: ProjectConfig): Promise<string> {
    const dir = path.join(tempDir, name);
    await writeTestTsConfig(dir, config ?? buildProjectConfig({ name }));
    return realpath(dir);
  }

  /** A directory with nothing installed in it yet, named as the registrar names it. */
  async function freshProject(): Promise<string> {
    const dir = path.join(tempDir, "fresh");
    await mkdir(dir, { recursive: true });
    return realpath(dir);
  }

  async function installGlobal(overrides: Partial<ProjectConfig>): Promise<string> {
    return writeTestTsConfig(
      home.dir,
      buildProjectConfig({
        name: "global-install",
        skills: [buildSkillConfig(REACT, { scope: "global" })],
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        ...overrides,
      }),
    );
  }

  function sessionWith(overrides: Partial<ProjectConfig>): ProjectConfig {
    return buildProjectConfig({
      name: "project",
      skills: [buildSkillConfig(REACT, { scope: "global" })],
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      ...overrides,
    });
  }

  function writeFromProject(
    project: string,
    finalConfig: ProjectConfig,
    projectInstallationExists = true,
  ): ReturnType<typeof writeConfigByScope> {
    return writeConfigByScope({
      finalConfig,
      matrix,
      agents: NO_AGENTS,
      projectDir: project,
      projectConfigPath: getProjectConfigPath(project, "claude"),
      projectInstallationExists,
    });
  }

  describe("writeConfigByScope from a project", () => {
    it("skips the global write when nothing in it moved, and says so", async () => {
      const project = await installProject("project");
      await installGlobal({ projects: [project] });

      const report = await writeFromProject(project, sessionWith({}));

      expect(report.globalWritten).toBe(false);
      said("Global config unchanged, skipping write");
    });

    it("writes the global pair when it moved, naming the file", async () => {
      const project = await installProject("project");
      const globalConfigPath = await installGlobal({ projects: [project] });

      const report = await writeFromProject(
        project,
        sessionWith({
          skills: [
            buildSkillConfig(REACT, { scope: "global" }),
            buildSkillConfig(VITEST, { scope: "global" }),
          ],
        }),
      );

      expect(report.globalWritten).toBe(true);
      said(`Updated global config at ${globalConfigPath}`);
    });

    it("propagates a change that moves types into the other registered projects, and recompiles them", async () => {
      const project = await installProject("project");
      const other = await installProject("other");
      await installGlobal({ projects: [project, other] });

      const report = await writeFromProject(
        project,
        sessionWith({
          skills: [
            buildSkillConfig(REACT, { scope: "global" }),
            buildSkillConfig(VITEST, { scope: "global" }),
          ],
        }),
      );

      expect(report.propagated.updated).toStrictEqual([other]);
      expect(report.recompile).toStrictEqual({
        rewrittenCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        warnings: [],
      });
      said("Propagated global changes to 1 project(s)");
    });

    it("counts a registered project whose config pair it rewrote as rewritten, though it holds no sub-agent", async () => {
      const project = await installProject("project");
      const agentless = await installProject(
        "agentless",
        buildProjectConfig({ name: "agentless", skills: [], agents: [] }),
      );
      await installGlobal({ projects: [project, agentless] });

      const report = await writeFromProject(
        project,
        sessionWith({
          skills: [
            buildSkillConfig(REACT, { scope: "global" }),
            buildSkillConfig(VITEST, { scope: "global" }),
          ],
        }),
      );

      expect(report.propagated.updated).toStrictEqual([agentless]);
      expect(report.recompile).toStrictEqual({
        rewrittenCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        warnings: [],
      });
    });

    it("propagates nothing when only the registration list moved", async () => {
      const first = await installProject("first");
      const second = await installProject("second");
      await installGlobal({});
      // The first write registers `first` and settles the global config's shape.
      await writeFromProject(first, sessionWith({}));

      const report = await writeFromProject(second, sessionWith({}));

      expect(report.changes.projectsChanged).toBe(true);
      expect(report.propagated).toStrictEqual(NOTHING_PROPAGATED);
      expect(report.recompile).toStrictEqual({
        rewrittenCount: 0,
        unchangedCount: 0,
        failedCount: 0,
        warnings: [],
      });
    });

    it("skips the project pair when nothing is the project's own and none is installed", async () => {
      const project = await freshProject();
      await installGlobal({});

      await writeFromProject(project, sessionWith({}), false);

      expect(await fileExists(getProjectConfigPath(project, "claude"))).toBe(false);
      said("Skipped project config — no existing project installation and no project-scoped items");
    });

    const OWN_ENTRIES: [name: string, own: Pick<ProjectConfig, "skills" | "agents">][] = [
      [
        "a sub-agent",
        { skills: [], agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }) },
      ],
      ["a skill", { skills: [buildSkillConfig(VITEST, { scope: "project" })], agents: [] }],
    ];

    it.each(OWN_ENTRIES)(
      "writes the project pair of a fresh project whose only own entry is %s, naming the file",
      async (_, own) => {
        const project = await freshProject();
        await installGlobal({});

        await writeFromProject(
          project,
          sessionWith({
            skills: [buildSkillConfig(REACT, { scope: "global" }), ...own.skills],
            agents: [...buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }), ...own.agents],
          }),
          false,
        );

        const configPath = getProjectConfigPath(project, "claude");
        expect(await fileExists(configPath)).toBe(true);
        said(`Updated project config at ${configPath}`);
      },
    );
  });

  describe("reconcileTypesFromDisk", () => {
    it("writes no global half and propagates nothing from a project", async () => {
      const project = await installProject("project");
      const other = await installProject("other");

      const report = await reconcileTypesFromDisk(
        project,
        buildProjectConfig({ name: "project", projects: [other] }),
        { matrix, agents: NO_AGENTS },
      );

      expect({ globalWritten: report.globalWritten, propagated: report.propagated }).toStrictEqual({
        globalWritten: false,
        propagated: NOTHING_PROPAGATED,
      });
    });

    it("rewrites the global types and propagates to every registered project from home", async () => {
      const other = await installProject("other");
      await installGlobal({ projects: [other] });

      const report = await reconcileTypesFromDisk(
        home.dir,
        buildProjectConfig({
          name: "global-install",
          skills: [buildSkillConfig(REACT, { scope: "global" })],
          agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
          projects: [other],
        }),
        { matrix, agents: NO_AGENTS },
      );

      expect(report.globalWritten).toBe(true);
      expect(report.propagated.updated).toStrictEqual([other]);
      said("Propagated global changes to 1 project(s)");
    });

    it("counts a registered project rewritten while the fan-out changes its pair, and unchanged once it does not", async () => {
      const agentless = await installProject(
        "agentless",
        buildProjectConfig({ name: "agentless", skills: [], agents: [] }),
      );
      await installGlobal({ projects: [agentless] });
      const reconcile = () =>
        reconcileTypesFromDisk(
          home.dir,
          buildProjectConfig({
            name: "global-install",
            skills: [buildSkillConfig(REACT, { scope: "global" })],
            agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
            projects: [agentless],
          }),
          { matrix, agents: NO_AGENTS },
        );

      const first = await reconcile();
      const second = await reconcile();

      expect(first.recompile).toStrictEqual({
        rewrittenCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        warnings: [],
      });
      expect(second.recompile).toStrictEqual({
        rewrittenCount: 0,
        unchangedCount: 1,
        failedCount: 0,
        warnings: [],
      });
    });

    it("visits every registered project when one's config cannot be opened, naming that one unreadable", async () => {
      const locked = await installProject("locked");
      const other = await installProject("other");
      await installGlobal({ projects: [locked, other] });
      const lockedConfig = getProjectConfigPath(locked, "claude");
      await chmod(lockedConfig, UNOPENABLE_FILE);

      try {
        const report = await reconcileTypesFromDisk(
          home.dir,
          buildProjectConfig({
            name: "global-install",
            skills: [buildSkillConfig(REACT, { scope: "global" })],
            agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
            projects: [locked, other],
          }),
          { matrix, agents: NO_AGENTS },
        );

        expect(report.propagated).toStrictEqual({
          ...NOTHING_PROPAGATED,
          updated: [other],
          unreadable: [locked],
        });
        expect(report.recompile).toStrictEqual({
          rewrittenCount: 1,
          unchangedCount: 0,
          failedCount: 0,
          warnings: [],
        });
      } finally {
        await chmod(lockedConfig, READ_WRITE_FILE);
      }
    });

    it("says nothing about propagating from home when no registered project took the change", async () => {
      const gone = path.join(tempDir, "gone");
      await installGlobal({ projects: [gone] });

      await reconcileTypesFromDisk(
        home.dir,
        buildProjectConfig({ name: "global-install", projects: [gone] }),
        {
          matrix,
          agents: NO_AGENTS,
        },
      );

      expect(consoleSpies.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Propagated global changes"),
      );
    });

    it("rewrites the global types and propagates nothing from home with nothing registered", async () => {
      await installGlobal({});

      const report = await reconcileTypesFromDisk(
        home.dir,
        buildProjectConfig({ name: "global-install" }),
        { matrix, agents: NO_AGENTS },
      );

      expect({ globalWritten: report.globalWritten, propagated: report.propagated }).toStrictEqual({
        globalWritten: true,
        propagated: NOTHING_PROPAGATED,
      });
    });
  });

  it("answers false for a types write at project scope, which writes no global half", async () => {
    const project = await installProject("project");

    expect(
      await writeScopeConfigTypes(project, buildProjectConfig({ name: "project" }), {
        matrix,
        agents: NO_AGENTS,
      }),
    ).toBe(false);
  });

  describe("mutateGlobal", () => {
    let marketplace: TestDirs;

    beforeEach(async () => {
      marketplace = await createTestSource();
    });

    afterEach(async () => {
      await cleanupTestSource(marketplace);
    });

    function lazyDeps() {
      return { loadMatrix: vi.fn(async () => matrix), loadAgents: vi.fn(async () => NO_AGENTS) };
    }

    it("records a new marketplace and propagates it without regenerating the projects' types", async () => {
      const other = await installProject("other");
      await installGlobal({ projects: [other] });

      const report = await mutateGlobal(
        { kind: "set-source", source: marketplace.sourceDir, fallbackName: "global-install" },
        lazyDeps(),
      );

      expect((await loadProjectConfigFromDir(home.dir, "claude"))?.config.marketplace).toBe(
        marketplace.sourceDir,
      );
      expect(report.propagated.updated).toStrictEqual([other]);
      expect(
        await fileExists(
          path.join(
            path.dirname(getProjectConfigPath(other, "claude")),
            STANDARD_FILES.CONFIG_TYPES_TS,
          ),
        ),
      ).toBe(false);
      expect(
        report.recompile,
        "a project whose config.ts took the new marketplace was rewritten, recompile or not",
      ).toStrictEqual({ rewrittenCount: 1, unchangedCount: 0, failedCount: 0, warnings: [] });
    });

    it("says nothing about propagating when no registered project took the change", async () => {
      const gone = path.join(tempDir, "gone");
      await installGlobal({ projects: [gone] });

      const report = await mutateGlobal(
        { kind: "set-source", source: marketplace.sourceDir, fallbackName: "global-install" },
        lazyDeps(),
      );

      expect(report.propagated.updated).toStrictEqual([]);
      expect(consoleSpies.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Propagated global changes"),
      );
    });

    it("loads nothing to propagate with when no project is registered", async () => {
      await installGlobal({});
      const deps = lazyDeps();

      await mutateGlobal(
        { kind: "set-source", source: marketplace.sourceDir, fallbackName: "global-install" },
        deps,
      );

      expect(deps.loadMatrix).not.toHaveBeenCalled();
    });

    it("deregisters nothing, and reads no path, when no project is registered", async () => {
      await installGlobal({});

      const report = await mutateGlobal(
        { kind: "deregister-project", projectDir: path.join(tempDir, "never-existed") },
        lazyDeps(),
      );

      expect(report.globalWritten).toBe(false);
    });
  });

  it("refuses a partial write into the home directory, and writes one into a project", async () => {
    await expect(writeProjectPartial(home.dir, { name: "global-install" })).rejects.toBeInstanceOf(
      GlobalPairWriteViolation,
    );
    expect(await fileExists(getProjectConfigPath(home.dir, "claude"))).toBe(false);
    expect(
      await directoryExists(path.dirname(getProjectConfigPath(home.dir, "claude"))),
      "the refusal comes before any folder is made for the write",
    ).toBe(false);

    const project = path.join(tempDir, "project");
    await writeProjectPartial(project, { name: "project" });
    expect(await fileExists(getProjectConfigPath(project, "claude"))).toBe(true);
  });

  it("reports a global removal as writing no global pair", async () => {
    const other = await installProject("other");

    const report = await propagateGlobalRemoval(
      buildProjectConfig({ name: "global-install", projects: [other] }),
      { matrix, agents: NO_AGENTS },
      "claude",
    );

    expect(report.globalWritten).toBe(false);
  });

  it("prunes no project and counts none for a global removal with none registered", async () => {
    const report = await propagateGlobalRemoval(
      buildProjectConfig({ name: "global-install" }),
      { matrix, agents: NO_AGENTS },
      "claude",
    );

    expect({ propagated: report.propagated, recompile: report.recompile }).toStrictEqual({
      propagated: NOTHING_PROPAGATED,
      recompile: { rewrittenCount: 0, unchangedCount: 0, failedCount: 0, warnings: [] },
    });
  });
});
