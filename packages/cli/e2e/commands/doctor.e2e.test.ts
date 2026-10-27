import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { DIRS, doctorRow, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupTempDir,
  createTempDir,
  matchedAsWritten,
  renderConfigTs,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/** Skipped together, so naming them tells a skip from a report that stopped early. */
const CONFIG_DEPENDENT_ROWS = [
  STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
  STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED,
  STEP_TEXT.DOCTOR_ROW_NO_ORPHANS,
  STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED,
  STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED,
] as const;

/** Mirrors the verdict doctor gives a config that loads and then fails `validateProjectConfig`. */
const CONFIG_HAS_ERRORS = "has errors";

/** Mirrors `validateProjectConfig`: the loader's lenient schema takes `name: ""`, this does not. */
const NAMELESS_CONFIG_ERROR = "name is required and must be a string";

/** Each of a scope's two installations is reported under a heading of its own. */
function installationBlock(provider: string): string {
  return `\n {2}The ${provider} installation\n`;
}

describe("doctor command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should report a missing config, skip every check that depends on it, and tip at init", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Doctor");
    expect(stdout).toContain("Checking configuration health");
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);

    for (const row of CONFIG_DEPENDENT_ROWS) {
      expect(stdout).toMatch(
        doctorRow(row, STEP_TEXT.DOCTOR_STATUS_SKIP, STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID),
      );
    }
    expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);

    // The count, not the word: `toContain("error")` matches any id or path.
    expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 7 passed, 0 warnings, 1 error`);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
  });

  it("should pass config check with valid config file", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(
      tempDir,
      buildProjectConfig({
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      }),
    );

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
  });

  describe("--help flag", () => {
    it("should display help output", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["doctor", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Diagnose");
      expect(stdout).not.toContain("--verbose");
    });
  });

  describe("corrupt config file", () => {
    it("should not crash and should report config error with corrupt config.ts", async () => {
      tempDir = await createTempDir();

      // writeProjectConfig() emits only valid configs, so the unparseable one uses the error-path
      // writer.
      await writeCorruptConfig(tempDir, renderUnparseableConfigTs());

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
      expect(stdout).toContain(FILES.CONFIG_TS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    });
  });

  describe("global installation fallback", () => {
    it("should validate global installation when no project config exists", async () => {
      tempDir = await createTempDir();

      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-test",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        }),
      );

      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
    });
  });

  describe("a config that loads and is not usable", () => {
    it("should fail the config row naming the field it lacks, and skip every check that reads it", async () => {
      tempDir = await createTempDir();
      const project = {
        dir: path.join(tempDir, "project"),
        globalHome: path.join(tempDir, "home"),
      };
      await mkdir(project.globalHome, { recursive: true });
      // Declares an agent, so it is a config with content rather than one declaring nothing.
      await writeCorruptConfig(
        project.dir,
        renderConfigTs(
          buildProjectConfig({
            name: "",
            skills: [],
            agents: buildAgentConfigs(["web-developer"]),
          }),
        ),
      );

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(
        stdout,
        "the content layer refused the file, so no operational row below is about this verdict",
      ).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      const configRow = doctorRow(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
        STEP_TEXT.DOCTOR_STATUS_FAIL,
        `${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS} ${CONFIG_HAS_ERRORS}\n`,
      );
      expect(stdout, "the row names what is wrong on the line beneath it").toMatch(
        new RegExp(`${configRow.source}\\s+${matchedAsWritten(NAMELESS_CONFIG_ERROR)}\n`),
      );
      for (const row of CONFIG_DEPENDENT_ROWS) {
        expect(stdout).toMatch(
          doctorRow(row, STEP_TEXT.DOCTOR_STATUS_SKIP, STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID),
        );
      }
      expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 8 passed, 0 warnings, 1 error`);
    });
  });

  describe("a home holding two installations, one of whose configs will not load", () => {
    it("should name the global config it could not read in that installation's block, and skip its rows", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-claude",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );
      // Written by hand: every config writer resolves the folder in use, which is Claude's here.
      const codexSource = path.join(globalHome, DIRS.SOURCE_CODEX);
      await mkdir(codexSource, { recursive: true });
      await writeFile(path.join(codexSource, FILES.CONFIG_TS), renderUnparseableConfigTs());
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(
        stdout,
        "the content layer reads Claude's config, the one in use, so the operational rows must run",
      ).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      const codexConfigRow = doctorRow(
        STEP_TEXT.DOCTOR_CONFIG_CHECK,
        STEP_TEXT.DOCTOR_STATUS_FAIL,
        `${STEP_TEXT.DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION} ~/${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS} ${STEP_TEXT.DOCTOR_CONFIG_UNREADABLE}\n`,
      );
      expect(stdout, "the row names the home's file, not one in the project").toMatch(
        new RegExp(`${installationBlock("codex")}\\s+${codexConfigRow.source}`),
      );
      const codexAgentsSkipped = doctorRow(
        STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED,
        STEP_TEXT.DOCTOR_STATUS_SKIP,
        STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID,
      );
      expect(stdout).toMatch(
        new RegExp(`${installationBlock("codex")}[\\s\\S]*${codexAgentsSkipped.source}`),
      );
    });
  });
});
