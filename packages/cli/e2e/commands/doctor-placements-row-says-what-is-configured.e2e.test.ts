import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  renderConfigTs,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, doctorRow, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

const PLACEMENTS_PASS = (message: string) =>
  doctorRow(STEP_TEXT.DOCTOR_ROW_PLACEMENTS, STEP_TEXT.DOCTOR_STATUS_PASS, `${message}\n`);

const PLACEMENTS_SKIPPED = doctorRow(
  STEP_TEXT.DOCTOR_ROW_PLACEMENTS,
  STEP_TEXT.DOCTOR_STATUS_SKIP,
  `${STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID}\n`,
);

const DECLARES_NOTHING = buildProjectConfig({ name: "declares-nothing", skills: [], agents: [] });

describe("doctor's Placements Offered row", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function homeIn(root: string): Promise<string> {
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    return home;
  }

  it("says no skills are configured in a folder with no configuration", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    const { stdout } = await CLI.run(["doctor"], {
      dir: projectDir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout).toMatch(PLACEMENTS_PASS(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED));
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE);
  });

  it("says no skills are configured in a project whose config declares nothing", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await writeProjectConfig(projectDir, DECLARES_NOTHING);

    const { stdout } = await CLI.run(["doctor"], {
      dir: projectDir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_DECLARES_NOTHING);
    expect(stdout).toMatch(PLACEMENTS_PASS(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED));
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE);
  });

  it("says no skills are configured at home when the global config declares nothing", async () => {
    tempDir = await createTempDir();
    const home = await homeIn(tempDir);
    await writeProjectConfig(home, DECLARES_NOTHING);

    const { stdout } = await CLI.run(["doctor"], { dir: home, globalHome: home });

    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_DECLARES_NOTHING);
    expect(stdout).toMatch(PLACEMENTS_PASS(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED));
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE);
  });

  it("says no skills are configured in a project whose config declares sub-agents and no skills", async () => {
    const project = await ProjectBuilder.editable({
      marketplace: E2E_SOURCE.sourceDir,
      skills: [],
    });
    tempDir = path.dirname(project.dir);

    const { stdout } = await CLI.run(["doctor"], {
      dir: project.dir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout, "the config loaded, naming no skill").toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        `${STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED}\n`,
      ),
    );
    expect(stdout).toMatch(PLACEMENTS_PASS(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED));
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE);
  });

  it("skips the row as it skips the rows beside it when the config loads with errors", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    // It configures a skill, so only the empty name stands between the row and its praise.
    await writeCorruptConfig(
      projectDir,
      renderConfigTs(
        buildProjectConfig({
          name: "",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { origin: "eject" }),
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: E2E_SOURCE.sourceDir,
        }),
      ),
    );

    const { stdout } = await CLI.run(["doctor"], {
      dir: projectDir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout, "the operational rows ran").not.toContain(
      STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR,
    );
    expect(stdout, "the row beside it stands down").toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
        STEP_TEXT.DOCTOR_STATUS_SKIP,
        `${STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID}\n`,
      ),
    );
    expect(stdout).toMatch(PLACEMENTS_SKIPPED);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE);
  });

  it("skips the row in the block of a second installation whose config cannot be read, praising the readable one", async () => {
    const project = await ProjectBuilder.editable({ marketplace: E2E_SOURCE.sourceDir });
    tempDir = path.dirname(project.dir);
    // By hand: every config writer resolves the folder in use, which is Claude's here.
    const codexSource = path.join(project.dir, DIRS.SOURCE_CODEX);
    await mkdir(codexSource, { recursive: true });
    await writeFile(path.join(codexSource, FILES.CONFIG_TS), renderUnparseableConfigTs());

    const { stdout } = await CLI.run(["doctor"], {
      dir: project.dir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout, "the operational rows ran").not.toContain(
      STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR,
    );
    const codexConfigUnreadable = doctorRow(
      STEP_TEXT.DOCTOR_CONFIG_CHECK,
      STEP_TEXT.DOCTOR_STATUS_FAIL,
      `${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS} ${STEP_TEXT.DOCTOR_CONFIG_UNREADABLE}\n`,
    );
    expect(stdout, "the Codex block opens on its unreadable config").toMatch(
      new RegExp(`The codex installation\\s+${codexConfigUnreadable.source}`),
    );
    expect(stdout).toMatch(
      new RegExp(
        `The claude installation[\\s\\S]*?${PLACEMENTS_PASS(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE).source}` +
          `[\\s\\S]*The codex installation[\\s\\S]*?${PLACEMENTS_SKIPPED.source}`,
      ),
    );
  });

  it("says every configured skill is placeable when skills are configured", async () => {
    const project = await ProjectBuilder.editable({ marketplace: E2E_SOURCE.sourceDir });
    tempDir = path.dirname(project.dir);

    const { stdout } = await CLI.run(["doctor"], {
      dir: project.dir,
      globalHome: await homeIn(tempDir),
    });

    expect(stdout).toMatch(PLACEMENTS_PASS(STEP_TEXT.DOCTOR_EVERY_SKILL_PLACEABLE));
  });
});
