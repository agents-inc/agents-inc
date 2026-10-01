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
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  expectNoSourceFolder,
  expectOnlySourceFolder,
} from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import "../matchers/setup.js";

/**
 * Uninstall now always removes the CLI config manifest (.claude-src/config.ts +
 * config-types.ts, and the directory when it empties) and deregisters the
 * project from the global config's `projects` registry. The `--all` flag that
 * previously gated manifest removal no longer exists.
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

    // The plan lists the manifest before removing it, in the folder this install is on
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);
    expect(stdout).toContain(".agents-inc/claude");
    expect(stdout).toContain(FILES.CONFIG_TS);

    // Both manifest files are gone and the emptied directory is removed
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

    // Proof-of-execution: the project is registered before uninstall
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
    // A user-owned .claude/settings.json keeps .claude/ alive after uninstall
    await createPermissionsFile(projectDir);

    const { exitCode } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const claudeDir = path.join(projectDir, DIRS.CLAUDE);
    expect(await directoryExists(claudeDir)).toBe(true);
    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);

    // The config manifest is still removed even though .claude/ is preserved
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
 * `.agents-inc/` groups one product's provider folders, so removing the last of them leaves a
 * directory that names a product with nothing installed. Uninstall's cleanup is leaf-first —
 * `removeDirIfEmpty` on the folder the config was in — and the parent one level up is the level
 * nothing looked at, so it survives every existing assertion: every spec that checks a source
 * folder is gone checks the LEAF, and a stranded `.agents-inc/` satisfies all of them.
 *
 * It is not cosmetic. A directory left where an install was is what a later `init` and `doctor`
 * read as a half-built layout, and the golden tree for the dual-scope journey records every empty
 * directory an install leaves behind — so a re-record taken before this lands writes
 * `project/.agents-inc` into the fixture as the expected behaviour.
 *
 * Both outcomes are here, in one file, because either alone is satisfied by the wrong product. A
 * cleanup that removed the parent unconditionally passes the first and deletes a consuming
 * repository's own state; one that never removes it passes the second and strands the directory.
 * Neither test means anything without the other.
 *
 * The installs are seeded on the NEW layout by hand rather than run through `init`, because this
 * is a question about cleanup rather than about which folder a fresh install is created in. R1
 * already teaches the CLI to READ a folder there, so the subject is reachable today and the red
 * below is about uninstall alone.
 */
describe("uninstall and the source folder's parent", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  /** An install on the new layout, with `extra` written beside the provider folder when given. */
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

    // Subject guard: the fixture really did put this install on the new layout, so the assertions
    // below are about a parent that exists. Seeded at the old name they would pass for free.
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
    // The roster rather than one `directoryExists` per name: what this leaves behind has to be
    // the parent and NOTHING else, and a pair of booleans cannot see a third name appear.
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
