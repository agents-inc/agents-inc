import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  FORKED_FROM_METADATA,
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  readTestFile,
  writeAgentFile,
  writeConfigTypes,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * A config file that exists but cannot be parsed is precisely the state a user needs to uninstall
 * from, so `uninstall` must degrade rather than abort. It previously let `ConfigLoadError` escape
 * `detectUninstallTarget`, killing the command before a single file was removed and leaving the
 * user with no way out except deleting directories by hand.
 *
 * The command now warns and treats the config as absent: only the parts of the plan that need the
 * config degrade (the plugins and compiled agents it named can no longer be identified), while the
 * manifest and CLI-managed skills are still removed and the run still exits successfully.
 */

/** A genuine TypeScript syntax error — the loader throws while evaluating the file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** A file that parses cleanly but exports nothing, so the loader gets no config object at all. */
const NO_DEFAULT_EXPORT = "";

/** Valid TypeScript whose shape the loader schema rejects (`skills` must be an array). */
const SCHEMA_VIOLATION = [
  `export default {`,
  `  name: "schema-violation-fixture",`,
  `  skills: "nope",`,
  `  agents: [],`,
  `};`,
].join("\n");

describe("uninstall with an unreadable config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /**
   * Builds a project whose config.ts is corrupt but whose CLI-managed skill and config-types.ts
   * companion are intact, then uninstalls it at genuine PROJECT scope (HOME kept distinct from the
   * project dir, otherwise the command resolves to the global install instead).
   */
  async function uninstallWithCorruptProjectConfig(configSource: string) {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeConfigTypes(project.dir);
    await writeCorruptConfig(project.dir, configSource);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const result = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );
    return { project, result };
  }

  /**
   * Every corruption kind reaches the same guard, so each case asserts the same three things: the
   * warning naming the degraded plan, a successful exit, and a manifest that is actually gone.
   */
  async function expectManifestRemovedDespiteWarning(configSource: string) {
    const { project, result } = await uninstallWithCorruptProjectConfig(configSource);

    expect(result.exitCode, `uninstall output:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(result.output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
    expect(result.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(project.dir))).toBe(false);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
    expect(await directoryExists(path.join(project.dir, DIRS.CLAUDE_SRC))).toBe(false);
    await expect(project).toHaveNoLocalSkills();
  }

  it("warns and still removes the manifest when the project config has a syntax error", async () => {
    await expectManifestRemovedDespiteWarning(SYNTAX_ERROR);
  });

  it("warns and still removes the manifest when the project config exports nothing", async () => {
    await expectManifestRemovedDespiteWarning(NO_DEFAULT_EXPORT);
  });

  it("warns and still removes the manifest when the project config violates the loader schema", async () => {
    await expectManifestRemovedDespiteWarning(SCHEMA_VIOLATION);
  });

  /**
   * The removal plan is a promise about what this run is about to do. With no readable config to
   * name them, the agent files are identified by the provenance marker the compiler stamps into
   * each one — and this fixture's agent was written by hand, so it carries none and stays. The
   * plan must therefore say the agent is kept and why, instead of naming its directory under the
   * removals and then not making one.
   *
   * The skills beside them are identified by their own `forked-from` metadata rather than by the
   * config, so they are still removed and their half of the section is still promised — which is
   * what makes this an assertion about the agents item rather than about the section wholesale.
   */
  it("keeps the compiled agents out of the removal plan when nothing identifies them", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeAgentFile(project.dir, E2E_AGENT["web-developer"].name, { frontmatter: true });
    await writeConfigTypes(project.dir);
    await writeCorruptConfig(project.dir, SYNTAX_ERROR);

    const agentFile = path.join(agentsPath(project.dir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CLI_MANAGED_SECTION);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    await expect(project).toHaveNoLocalSkills();
    expect(await fileExists(configTsPath(project.dir))).toBe(false);
  });

  /**
   * The same state with nothing else CLI-managed on disk. With the agents item gone the
   * `CLI-managed files:` section has no item left to carry, so the header must go with it — a
   * header over an empty list promises nothing and reads as a removal all the same.
   *
   * `Config:` is the control beneath it: the manifest is identified by its own path rather than by
   * anything inside it, so that section is still promised and still kept.
   */
  it("prints no CLI-managed files section when the kept agents were its only item", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });
    await writeConfigTypes(projectDir);
    await writeCorruptConfig(projectDir, SYNTAX_ERROR);

    const agentFile = path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);

    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_MANAGED_SECTION);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
  });

  /**
   * A global uninstall cannot prune the registered projects, because the `projects[]` registry
   * lives in the very config it cannot read. That is the correct outcome — the warning says the
   * content the config listed may be left behind — so the contract here is that the global manifest
   * still goes, the run still succeeds, and no other project is touched on the way.
   */
  it("removes the global manifest and leaves other projects untouched when the global config is unreadable", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const otherProject = path.join(tempDir, "other-project");

    await writeConfigTypes(globalHome);
    await writeCorruptConfig(globalHome, SYNTAX_ERROR);
    await writeProjectConfig(otherProject, {
      name: "bystander-project",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [{ name: "web-developer", scope: "global" }],
    });
    const otherConfigBefore = await readTestFile(configTsPath(otherProject));

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(globalHome))).toBe(false);
    expect(await fileExists(configTypesTsPath(globalHome))).toBe(false);
    expect(await directoryExists(path.join(globalHome, DIRS.CLAUDE_SRC))).toBe(false);

    // No registry could be read, so nothing may be reported as pruned and the bystander project's
    // config must come out byte-identical.
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    expect(await readTestFile(configTsPath(otherProject))).toBe(otherConfigBefore);
  });

  /**
   * The control. A config that is simply absent is a legitimate state, not a corruption, and must
   * stay silent — this pins that making the corrupt path survivable did not make the clean path
   * noisy. Without it, a guard that warned unconditionally would satisfy every test above.
   */
  it("does not warn about an unreadable config when no config file exists at all", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await createLocalSkill(projectDir, E2E_SKILL.react.id, { metadata: FORKED_FROM_METADATA });

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    await expect({ dir: projectDir }).toHaveNoLocalSkills();
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
  });
});
