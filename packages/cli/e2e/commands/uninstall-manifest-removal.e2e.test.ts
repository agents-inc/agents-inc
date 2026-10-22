import path from "path";
import { realpathSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  directoryExists,
  fileExists,
  writeProjectConfig,
  writeProjectConfigIn,
  writeConfigTypes,
  configTsPath,
  configTypesTsPath,
  loadConfigOrFail,
  createPermissionsFile,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES, REMOVED_MARKER, STEP_TEXT } from "../pages/constants.js";
import {
  expectNoSourceFolder,
  expectOnlySourceFolder,
} from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import "../matchers/setup.js";

/**
 * Uninstall always removes the config manifest (config.ts, config-types.ts and the emptied
 * directory) and deregisters the project from the global registry.
 */
describe("uninstall config manifest removal", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("removes config.ts and config-types.ts and lists the manifest in the plan", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await writeConfigTypes(projectDir);

    expect(await fileExists(configTsPath(projectDir))).toBe(true);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(stdout).toContain(`${REMOVED_MARKER} ${configTsPath(projectDir)}`);

    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
    await expectNoSourceFolder(
      projectDir,
      "both manifest files are gone and the emptied source folder is removed",
    );
  });

  it("deregisters the project from the global config's projects registry", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    const realProjectDir = realpathSync(projectDir);

    const globalHome = path.join(tempDir, "global-home");
    await writeProjectConfig(
      globalHome,
      buildProjectConfig({
        name: "global-test",
        skills: [],
        agents: [],
        projects: [realProjectDir],
      }),
    );

    // Proof of execution: the project is registered before uninstall.
    const before = await loadConfigOrFail(globalHome);
    expect(before.projects).toContain(realProjectDir);

    const { exitCode } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const after = await loadConfigOrFail(globalHome);
    expect(after.projects).not.toContain(realProjectDir);
  });

  it("keeps user content in .claude/ while removing the config manifest", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    // A user-owned settings.json keeps .claude/ alive.
    await createPermissionsFile(projectDir);

    const { exitCode } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const claudeDir = path.join(projectDir, DIRS.CLAUDE);
    expect(await directoryExists(claudeDir)).toBe(true);
    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);

    expect(await fileExists(configTsPath(projectDir))).toBe(false);
  });

  it("removes the global config manifest on a global uninstall", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    await writeProjectConfig(
      globalHome,
      buildProjectConfig({ name: "global-test", skills: [], agents: [] }),
    );
    await writeConfigTypes(globalHome);

    expect(await fileExists(configTsPath(globalHome))).toBe(true);

    const { exitCode } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    expect(await fileExists(configTsPath(globalHome))).toBe(false);
    expect(await fileExists(configTypesTsPath(globalHome))).toBe(false);
    await expectNoSourceFolder(
      globalHome,
      "the global manifest is gone and the emptied source folder is removed",
    );
  });
});

/**
 * Uninstall removes `.agents-inc/` once its last provider folder goes, and keeps it while it holds
 * anything else; each outcome alone is satisfied by the wrong product. Seeded by hand on the new
 * layout: the subject is cleanup, not where `init` creates the folder.
 */
describe("uninstall and the source folder's parent", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  async function seedNewLayoutInstall(extra?: { name: string; content: string }): Promise<string> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    await writeProjectConfigIn(
      projectDir,
      DIRS.SOURCE_CLAUDE,
      buildProjectConfig({ name: "parent-cleanup", skills: [], agents: [] }),
    );
    await writeConfigTypes(projectDir, DIRS.SOURCE_CLAUDE);

    if (extra) {
      await writeFile(path.join(projectDir, DIRS.SOURCE_ROOT, extra.name), extra.content, "utf-8");
    }

    // Subject guard: the install really is on the new layout.
    expect(
      await fileExists(path.join(projectDir, DIRS.SOURCE_CLAUDE, FILES.CONFIG_TS)),
      "the fixture did not seed an install on the folder this describe block is about",
    ).toBe(true);

    return projectDir;
  }

  it("removes .agents-inc/ once the last provider folder under it is gone", async () => {
    const projectDir = await seedNewLayoutInstall();

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    expect(await directoryExists(path.join(projectDir, DIRS.SOURCE_CLAUDE))).toBe(false);
    expect(
      await directoryExists(path.join(projectDir, DIRS.SOURCE_ROOT)),
      "the provider folder went and its parent stayed — a directory naming this product with nothing installed under it",
    ).toBe(false);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SOURCE_ROOT_REMOVED);
  });

  it("keeps .agents-inc/ when something else lives in it, and says so", async () => {
    const gateState = { name: "gate-state.json", content: '{"attempts":2}\n' };
    const projectDir = await seedNewLayoutInstall(gateState);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    expect(
      await fileExists(path.join(projectDir, DIRS.SOURCE_ROOT, gateState.name)),
      "uninstall removed a file under .agents-inc/ that this CLI never wrote",
    ).toBe(true);
    // The roster, not booleans per name: a third name must not appear.
    await expectOnlySourceFolder(
      projectDir,
      [DIRS.SOURCE_ROOT],
      "uninstall kept .agents-inc/ for the file it does not own, and must have left no source folder under it",
    );
    expect(
      stdout,
      "uninstall left .agents-inc/ behind without saying so — a directory kept in silence reads as one it forgot",
    ).toContain(STEP_TEXT.UNINSTALL_SOURCE_ROOT_KEPT);
  });
});
