import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  runCLI,
  writeAgentFile,
  writeConfigTypes,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * `doctor`'s Layout row, one per scope in play.
 *
 * This is the surface that reaches an installation still on the folder the rename retired, and
 * it is the only one: nothing in the CLI moves a source folder, so the row says which folder the
 * scope is on and names the move as the manual operation it is. The registry does not reach them
 * either — it holds a fraction of the installations on a machine, one entry against six on the
 * owner's own — so the row that lists them says what the list IS rather than reading as an
 * inventory.
 *
 * Every spec here pairs a scope that IS reported with one that is not, in this file. A row that
 * only ever fires is indistinguishable from a row that fires unconditionally, and both read the
 * same in a green run.
 */

/** An installed agent whose prompt tells it to author into a folder this installation is not on. */
const SUMMONER_NAMING_THE_OTHER_FOLDER =
  "Author new sub-agents into .agents-inc/claude/agents/<name>/.\n";

describe("doctor's Layout row", () => {
  let tempDir: string;
  let projectDir: string;
  let home: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  async function scopes(): Promise<void> {
    tempDir = await createTempDir();
    projectDir = path.join(tempDir, "project");
    home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });
  }

  async function install(root: string, sourceFolder: string, name: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      sourceFolder,
      buildProjectConfig({ name, skills: [], agents: [] }),
    );
    await writeConfigTypes(root, sourceFolder);
  }

  async function doctorIn(cwd: string) {
    return runCLI(["doctor"], cwd, { env: { HOME: home } });
  }

  describe("the row names which layout each scope is on", () => {
    it("warns for a scope still on the old folder, and names the move as a manual one", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");

      const { exitCode, combined } = await doctorIn(projectDir);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.DOCTOR_ROW_LAYOUT);
      expect(combined).toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY);
      expect(
        combined,
        "a warning that does not say what to do about it is a row nobody can act on, and the only thing to do is a move the user makes themselves",
      ).toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY_MANUAL_MOVE);
    });

    it("says nothing to do for a scope on the current folder", async () => {
      await scopes();
      await install(projectDir, DIRS.SOURCE_CLAUDE, "current-project");

      const { combined } = await doctorIn(projectDir);

      expect(combined).toContain(STEP_TEXT.DOCTOR_LAYOUT_CURRENT);
      expect(
        combined,
        "without this the warning above cannot tell a row that reads the layout from one that warns at every installation it is shown",
      ).not.toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY);
    });

    it("reports each scope separately when the two are on different layouts", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");
      await install(home, DIRS.SOURCE_CLAUDE, "current-global");

      const { combined } = await doctorIn(projectDir);

      expect(combined).toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY);
      expect(
        combined,
        "one row for two scopes on different layouts can only be wrong about one of them",
      ).toContain(STEP_TEXT.DOCTOR_LAYOUT_CURRENT);
    });
  });

  describe("the row fails rather than warns", () => {
    it("when both folders are on disk, naming both", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");
      await install(projectDir, DIRS.SOURCE_CLAUDE, "rival-project");

      const { exitCode, combined } = await doctorIn(projectDir);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(combined).toContain(STEP_TEXT.DOCTOR_LAYOUT_BOTH_FOLDERS);
    });

    it("and not when one folder is on disk, which is a supported state", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");

      const { exitCode, combined } = await doctorIn(projectDir);

      expect(
        exitCode,
        "without this the failure above cannot tell a row that fires on two folders from one that fails at every installation on the old name",
      ).toBe(EXIT_CODES.SUCCESS);
      expect(combined).not.toContain(STEP_TEXT.DOCTOR_LAYOUT_BOTH_FOLDERS);
    });

    it("when an installed agent's prompt names the other folder", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");
      await writeAgentFile(projectDir, "agent-summoner", {
        frontmatter: true,
        body: SUMMONER_NAMING_THE_OTHER_FOLDER,
      });

      const { exitCode, combined } = await doctorIn(projectDir);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(
        combined,
        "an agent told to author into a folder the resolver does not read writes files that silently never compile",
      ).toContain(STEP_TEXT.DOCTOR_LAYOUT_STALE_COMPILED_AGENT);
    });
  });

  describe("at HOME, the registered projects still on the old name", () => {
    it("are listed, and the list says what it is", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");
      await writeProjectConfigIn(
        home,
        DIRS.SOURCE_CLAUDE,
        buildProjectConfig({ name: "the-global", skills: [], agents: [], projects: [projectDir] }),
      );
      await writeConfigTypes(home, DIRS.SOURCE_CLAUDE);

      const { combined } = await doctorIn(home);

      expect(combined).toContain(projectDir);
      expect(
        combined,
        "the registry holds a fraction of the installs on a machine, so a list printed without that caveat reads as an inventory and under-reports by whatever the factor happens to be",
      ).toContain(STEP_TEXT.DOCTOR_REGISTRY_IS_NOT_AN_INVENTORY);
    });

    it("are not listed when every registered project is on the current folder", async () => {
      await scopes();
      await install(projectDir, DIRS.SOURCE_CLAUDE, "current-project");
      await writeProjectConfigIn(
        home,
        DIRS.SOURCE_CLAUDE,
        buildProjectConfig({ name: "the-global", skills: [], agents: [], projects: [projectDir] }),
      );
      await writeConfigTypes(home, DIRS.SOURCE_CLAUDE);

      const { combined } = await doctorIn(home);

      expect(
        combined,
        "the subject guard: without a Layout row in this very output, the absence below is satisfied by a report that never looked at a layout at all",
      ).toContain(STEP_TEXT.DOCTOR_ROW_LAYOUT);
      expect(combined).not.toContain(STEP_TEXT.DOCTOR_REGISTRY_IS_NOT_AN_INVENTORY);
    });
  });

  describe("a scope on the old name alone earns no line from a write command", () => {
    it("because it is read and written where it is, indefinitely", async () => {
      await scopes();
      await install(projectDir, DIRS.CLAUDE_SRC, "legacy-project");

      // The exit code is not asserted and is not the subject: this fixture carries no skills, so
      // `compile` refuses for that reason, which says nothing about the layout either way.
      const { stderr } = await runCLI(["compile"], projectDir, { env: { HOME: home } });

      expect(
        (await doctorIn(projectDir)).combined,
        "the subject guard, and it is about this fixture rather than this output: the absence below means nothing unless the project really is on the folder the row warns about",
      ).toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY);
      expect(
        stderr,
        "doctor's Layout row is where this is said; a write command repeating it would be nagging about a state nothing is wrong with",
      ).not.toContain(STEP_TEXT.DOCTOR_LAYOUT_LEGACY_MANUAL_MOVE);
    });
  });
});
