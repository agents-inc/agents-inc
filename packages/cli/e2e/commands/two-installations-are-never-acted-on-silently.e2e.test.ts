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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * One scope holding a Claude installation and a Codex one, across every command that acts on it.
 *
 * **Four commands refused, `doctor` called it an error, and three said nothing at all.** `edit`,
 * `uninstall`, `share` and `eject` all raise `refuseAnAmbiguousInstallation` and name
 * `--provider`; `doctor`'s Placements Offered row reports the same finding as `1 finding would stop
 * a command acting here`. `compile`, `update` and `list` resolved the provider through
 * `providerInUse`, which answers by ROSTER ORDER — `PROVIDERS` is `["claude", "codex"]` — so the
 * two that WRITE rewrote one user's installation and reported success without naming it, and the
 * one that REPORTS showed one of the pair with nothing saying a second was there.
 *
 * Measured against the built CLI in a project carrying both source folders, 2026-09-23:
 *
 * ```
 * $ agents-inc share     # exit 1, "…holds 2 installations — claude and codex…"
 * $ agents-inc compile   # exit 0, "1 project agents rewritten" — the CLAUDE one, unnamed
 * $ agents-inc update    # exit 0, silent about which config it read
 * $ agents-inc list      # "Installation: dual-claude" and nothing about the other
 * ```
 *
 * So the pair is asserted together in one file: a refusal on its own cannot tell a correctly
 * scoped guard from one that has swallowed its domain, and every case here is paired with the
 * same command succeeding once `--provider` names an installation.
 */

/** The two installations one scope holds, named so an assertion can say which one answered. */
const CLAUDE_INSTALL = "two-installations-claude";
const CODEX_INSTALL = "two-installations-codex";

/** One ejected skill apiece, so each installation has something a compile pass can find. */
const SKILL_ID = E2E_SKILL.vitest.id;

/**
 * Where each host reads an ejected PROJECT skill from — `.claude/skills` against `.agents/skills`.
 *
 * Spelled per host rather than composed once, for `createLocalSkillIn`'s own reason: a fixture
 * that plants both halves under the Claude path leaves the Codex installation empty, and an empty
 * installation satisfies every assertion here for free.
 */
const SKILLS_DIR = {
  claude: path.join(DIRS.CLAUDE, STANDARD_DIRS.SKILLS),
  codex: DIRS.CODEX_PROJECT_SKILLS,
} as const;

/** The sub-agent each installation lists, so a role file on disk says which one was compiled. */
const CLAUDE_AGENT = "web-developer" as const satisfies AgentName;
const CODEX_AGENT = "cli-developer" as const satisfies AgentName;

/** What a Codex role file is called: Codex reads TOML where Claude reads Markdown. */
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
   * The role files one host wrote into this project, or none where it wrote nothing.
   *
   * `listFiles` rather than `readCompiledAgents`, which composes `.claude/agents` in its body and
   * so can only describe a Claude installation — the same host-blindness `createLocalSkillIn`
   * exists to answer. It already answers `[]` for a directory that is not there, which is one of
   * the two states under test rather than a failure.
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
    // Flattened: the refusal leads with the project's path, which pushes its sentence across
    // oclif's line breaks.
    const said = flattenCliOutput(combined);
    expect(said).toContain("2 installations");
    expect(said).toContain("--provider");
    expect(said).toContain("Nothing has been changed.");
  });

  it("compiles the installation --provider names, and only that one", async () => {
    await aProjectWithBothInstallations();

    const { exitCode, combined } = await run(["compile", "--provider", "codex"]);

    // The refusal above is only worth anything beside a state in which the same command runs:
    // a guard that had swallowed its whole domain would leave both of these red in the same way.
    expect(exitCode, combined).toBe(EXIT_CODES.SUCCESS);
    expect(combined).not.toContain("2 installations");

    // And the filesystem, because an exit code cannot tell "compiled the Codex installation" from
    // "compiled the Claude one and exited 0" — which is the defect, not a variant of it. Members
    // rather than a count: a count cannot see a swap, and a swap is exactly the subject here.
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

    // The installation it names is the CLAUDE one, which is correct and was never the defect:
    // what was missing is any statement that it is one of two, and which one.
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
