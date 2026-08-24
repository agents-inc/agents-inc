import path from "path";
import { realpathSync } from "fs";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
  fileExists,
  writeProjectConfig,
  writeConfigTypes,
  configTsPath,
  configTypesTsPath,
  loadConfigOrFail,
  createPermissionsFile,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

/**
 * Uninstall now always removes the CLI config manifest (.claude-src/config.ts +
 * config-types.ts, and the directory when it empties) and deregisters the
 * project from the global config's `projects` registry. The `--all` flag that
 * previously gated manifest removal no longer exists.
 */
describe("uninstall config manifest removal", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

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

    // The plan lists the .claude-src manifest before removing it
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);
    expect(stdout).toContain(DIRS.CLAUDE_SRC);
    expect(stdout).toContain(FILES.CONFIG_TS);

    // Both manifest files are gone and the emptied directory is removed
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
    expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(false);
  });

  it("deregisters the project from the global config's projects registry", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    const realProjectDir = realpathSync(projectDir);

    const globalHome = path.join(tempDir, "global-home");
    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [],
      agents: [],
      projects: [realProjectDir],
    });

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
    await writeProjectConfig(globalHome, { name: "global-test", skills: [], agents: [] });
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
    expect(await directoryExists(path.join(globalHome, DIRS.CLAUDE_SRC))).toBe(false);
  });
});
