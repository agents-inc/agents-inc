import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  cleanupTempDir,
  compactCliOutput,
  readTreeSnapshot,
  writeConfigTypes,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  HOME_SHORTHAND,
  STEP_TEXT,
  TIMEOUTS,
  oldSourceFolderIgnored,
} from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * CLI-931, owner 2026-10-24: every run prints one line per root holding an old `.claude-src/`,
 * HOME's first, saying it is ignored and naming the folder agents-inc reads there. At a terminal, a
 * run naming no command shows both lines and then opens the installation's dashboard.
 *
 * `getOutput()` is scrollback plus screen, so it holds every line the run left on the terminal, a
 * line written before Ink's first frame included; it is read before Escape, because the dashboard
 * clears screen and scrollback once it resolves. It is compacted because a path wider than the
 * terminal wraps across rows.
 *
 * The "left as it was" assertions are green before the fix too; they were checked by mutating the
 * fixture (a write into the old folder after the snapshot), which reddens them and nothing else.
 */

/** A file the user wrote under the old folder, which no run may touch. */
const USERS_FILE = path.join(DIRS.AGENTS, "my-agent", FILES.IDENTITY_MD);
const USERS_FILE_BODY = "An agent the user wrote under the old folder.\n";

describe("an old .claude-src folder, at a terminal", () => {
  let tempDir: string | undefined;
  let dashboard: DashboardSession | undefined;

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /** What an older release left behind: its config pair, and a file the user wrote there. */
  async function oldFolderIn(root: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      DIRS.RETIRED_SOURCE,
      buildProjectConfig({ name: "old-layout", skills: [], agents: [] }),
    );
    await writeConfigTypes(root, DIRS.RETIRED_SOURCE);
    const kept = path.join(root, DIRS.RETIRED_SOURCE, USERS_FILE);
    await mkdir(path.dirname(kept), { recursive: true });
    await writeFile(kept, USERS_FILE_BODY);
  }

  it(
    "is named as ignored above the dashboard a run naming no command opens, HOME's line first, and is left as it was",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { project, globalHome } = await ProjectBuilder.dualScope();
      tempDir = path.dirname(project.dir);
      await oldFolderIn(project.dir);
      await oldFolderIn(globalHome.dir);
      const before = {
        project: await readTreeSnapshot(project.dir),
        home: await readTreeSnapshot(globalHome.dir),
      };

      dashboard = await DashboardSession.launch({
        projectDir: project.dir,
        bare: true,
        env: { HOME: globalHome.dir },
      });
      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_LOAD);
      const output = dashboard.getOutput();
      await dashboard.escape();
      const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);
      // The dashboard's first row is its logo, so the block ends where the logo begins.
      const linesThenTheDashboard = compactCliOutput(
        [
          oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
          oldSourceFolderIgnored(project.dir, DIRS.SOURCE_CLAUDE),
          STEP_TEXT.LOGO_BANNER,
        ].join("\n"),
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(
        await readTreeSnapshot(project.dir),
        "the project, its old folder included, is left as it was",
      ).toStrictEqual(before.project);
      expect(
        await readTreeSnapshot(globalHome.dir),
        "HOME, its old folder included, is left as it was",
      ).toStrictEqual(before.home);
      expect(output, "the dashboard painted").toContain(STEP_TEXT.DASHBOARD);
      expect(
        compactCliOutput(output).indexOf(linesThenTheDashboard),
        `the terminal opens with one line per root, HOME's first, and the dashboard follows them:\n${output}`,
      ).toBe(0);
    },
  );
});
