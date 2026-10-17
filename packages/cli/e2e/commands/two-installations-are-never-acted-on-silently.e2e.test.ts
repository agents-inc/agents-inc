import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createLocalSkillIn,
  createTempDir,
  flattenCliOutput,
  listFiles,
  renderMetadataYaml,
  runCLI,
  writeConfigTypes,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, FILES } from "../pages/constants.js";
import { STANDARD_DIRS } from "../../src/cli/consts.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * One scope holding a Claude and a Codex installation: every command that acts on it refuses naming
 * `--provider` (doctor reports it), and each case is paired with the same command succeeding once
 * `--provider` names one.
 */

const CLAUDE_INSTALL = "two-installations-claude";
const CODEX_INSTALL = "two-installations-codex";

/** So each installation has something a compile pass can find. */
const SKILL_ID = E2E_SKILL.vitest.id;

/**
 * Spelled per host: planting both under the Claude path leaves the Codex installation empty, which
 * satisfies everything for free.
 */
const SKILLS_DIR = {
  claude: path.join(DIRS.CLAUDE, STANDARD_DIRS.SKILLS),
  codex: DIRS.CODEX_PROJECT_SKILLS,
} as const;

/** So a role file on disk says which installation was compiled. */
const CLAUDE_AGENT = "web-developer" as const satisfies AgentName;
const CODEX_AGENT = "cli-developer" as const satisfies AgentName;

/** Codex reads TOML where Claude reads Markdown. */
const CODEX_ROLE_SUFFIX = FILES.CODEX_AGENT_EXTENSION;

describe("a scope holding two installations", () => {
  let tempDir = "";
  let projectDir = "";
  let home = "";

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  async function aProjectWithBothInstallations(): Promise<void> {
    tempDir = await createTempDir();
    projectDir = path.join(tempDir, "project");
    home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });

    await install(DIRS.SOURCE_CLAUDE, CLAUDE_INSTALL, SKILLS_DIR.claude, CLAUDE_AGENT);
    await install(DIRS.SOURCE_CODEX, CODEX_INSTALL, SKILLS_DIR.codex, CODEX_AGENT);
  }

  async function install(
    sourceFolder: string,
    name: string,
    skillsDir: string,
    agent: AgentName,
  ): Promise<void> {
    await writeProjectConfigIn(
      projectDir,
      sourceFolder,
      buildProjectConfig({
        name,
        skills: buildSkillConfigs([SKILL_ID], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs([agent], { scope: "project" }),
      }),
    );
    await writeConfigTypes(projectDir, sourceFolder);
    await createLocalSkillIn(path.join(projectDir, skillsDir), SKILL_ID, {
      description: "Ejected skill so each installation has content a compile pass can find",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(SKILL_ID),
        contentHash: "hash-two-installations",
      }),
    });
  }

  async function run(args: string[]) {
    return runCLI(args, projectDir, { env: { HOME: home } });
  }

  /**
   * `listFiles`, not `readCompiledAgents`, which only knows `.claude/agents`; `[]` for a missing
   * directory is a state under test.
   */
  async function roleFilesIn(hostDir: string): Promise<string[]> {
    return (await listFiles(path.join(projectDir, hostDir, DIRS.AGENTS))).sort();
  }

  it("refuses a compile that cannot tell which installation it is about", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["compile"]);

    expect(
      exitCode,
      "compile resolves the provider by roster order, so it rewrites the Claude installation of a project that also has a Codex one and reports success",
    ).toBe(EXIT_CODES.INVALID_ARGS);
    // Flattened: the project's path pushes the refusal across oclif's line breaks.
    const said = flattenCliOutput(combined);
    expect(said).toContain("2 installations");
    expect(said).toContain("--provider");
    expect(said).toContain("Nothing has been changed.");
  });

  it("compiles the installation --provider names, and only that one", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["compile", "--provider", "codex"]);

    // Beside the refusal: a guard that swallowed its domain would fail here.
    expect(exitCode, combined).toBe(EXIT_CODES.SUCCESS);
    expect(combined).not.toContain("2 installations");

    // The filesystem, since an exit code cannot tell which installation compiled; members, not a
    // count.
    expect(await roleFilesIn(DIRS.CODEX)).toStrictEqual([`${CODEX_AGENT}${CODEX_ROLE_SUFFIX}`]);
    expect(
      await roleFilesIn(DIRS.CLAUDE),
      "the Claude installation was rewritten by a run that named codex",
    ).toStrictEqual([]);
  });

  it("refuses an update that cannot tell which installation it is about", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["update"]);

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    const said = flattenCliOutput(combined);
    expect(said).toContain("2 installations");
    expect(said).toContain("--provider");
  });

  it("updates the installation --provider names", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["update", "--provider", "codex"]);

    expect(exitCode, combined).toBe(EXIT_CODES.SUCCESS);
  });

  it("says a second installation is here when list reports one of them", async () => {
    await aProjectWithBothInstallations();

    const { combined } = await run(["list"]);

    // Naming the Claude one is correct; the defect was not saying it is one of two.
    expect(combined).toContain(CLAUDE_INSTALL);
    expect(
      combined,
      "list prints one installation's name, mode and config path with nothing anywhere saying a second one is there",
    ).toContain("2 installations \u2014 claude and codex");
    expect(combined).toContain("--provider");
  });

  it("lists the installation --provider names", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["list", "--provider", "codex"]);

    expect(exitCode, combined).toBe(EXIT_CODES.SUCCESS);
    expect(combined).toContain(CODEX_INSTALL);
    expect(combined).not.toContain(CLAUDE_INSTALL);
  });
});
