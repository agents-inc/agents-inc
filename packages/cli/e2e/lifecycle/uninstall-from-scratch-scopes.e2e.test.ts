import path from "path";
import { realpathSync } from "fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  createDualScopeEnv,
  createTestEnvironment,
  initGlobalWithEject,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  skillsPath,
  writeAgentFile,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `uninstall` from an installation this suite actually made.
 *
 * Every existing uninstall spec starts from a `ProjectBuilder`-written config, so
 * the suite could prove uninstall removes what a fixture wrote and never that it
 * removes what `init` installs. The difference is not cosmetic: a fixture writes
 * one scope's files, and a real install writes a global config, a project config,
 * a `config-types.ts` beside each, ejected skill directories and compiled agents
 * — the removal plan has to name all of them or leave the user half-uninstalled.
 *
 * The dual-scope spec is where the four surfaces are asserted in both forms at
 * once: gone at the scope the command ran in, and unchanged at the scope it must
 * not have touched. "The global install survived" is a claim, and an absent
 * assertion satisfies it for free. The single exception is stated as an equality
 * rather than tolerated: a project uninstall deregisters that project from the
 * global `projects[]` registry, and nothing else about the global config moves.
 */

/** A genuine TypeScript syntax error — the loader throws while evaluating the file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** An agent file the user wrote, carrying no provenance marker — never this CLI's to delete. */
const HAND_WRITTEN_AGENT = "my-custom-agent";

describe("uninstall removes a from-scratch install, scope by scope", () => {
  let tempDir: string | undefined;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP);

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "removes the skills, agents, config and generated types of a global install",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const testEnv = await createTestEnvironment();
      tempDir = testEnv.tempDir;
      const { fakeHome } = testEnv;

      const install = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(install.exitCode, `global init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Everything the run must remove is there beforehand — otherwise the
      // post-conditions are satisfied by a run that removed nothing.
      expect((await listFiles(skillsPath(fakeHome))).length).toBeGreaterThan(0);
      expect(Object.keys(await readCompiledAgents(fakeHome)).length).toBeGreaterThan(0);
      expect(await fileExists(configTsPath(fakeHome))).toBe(true);
      expect(await fileExists(configTypesTsPath(fakeHome))).toBe(true);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      // Surface 2: the plan is printed before anything is removed, and it names
      // the config manifest — a removal the user cannot see is one they cannot stop.
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_PREVIEW_HEADING);
      expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // Surfaces 1 and 3: skills, compiled agents and the config manifest go.
      await expectCleanUninstall(fakeHome, { removeConfig: true });
      // Surface 4: the generated type surface goes with the config it describes —
      // a config-types.ts outliving its config.ts is a file whose aliases name an
      // installation that no longer exists.
      expect(
        await fileExists(configTypesTsPath(fakeHome)),
        "config-types.ts must not outlive the config it was generated from",
      ).toBe(false);
    },
  );

  it(
    "removes only the project half of a dual-scope install and leaves the global half intact but deregistered",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      // The global side, captured on all four surfaces before the project-scope
      // run — each snapshot is checked non-empty, or "unchanged" would hold
      // trivially for a scope that had nothing in it.
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      const globalSkillsBefore = (await listFiles(skillsPath(fakeHome))).sort();
      const globalConfigBefore = await loadConfigOrFail(fakeHome);
      const globalTypesBefore = await readTestFile(configTypesTsPath(fakeHome));
      expect(
        globalConfigBefore.projects,
        "the global config must have the project registered, or the deregistration below is vacuous",
      ).toStrictEqual([realpathSync(projectDir)]);
      expect(Object.keys(globalAgentsBefore).length).toBeGreaterThan(0);
      expect(globalSkillsBefore.length).toBeGreaterThan(0);

      expect(await fileExists(configTsPath(projectDir))).toBe(true);
      expect(Object.keys(await readCompiledAgents(projectDir)).length).toBeGreaterThan(0);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // The project half is gone on every surface.
      await expectCleanUninstall(projectDir, { removeConfig: true });
      expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE_SRC))).toBe(false);

      // The global half is untouched on every surface. Byte comparisons, not
      // existence checks: a rewrite that kept the files but changed what they
      // declare passes every "still there" assertion.
      expect(
        await readCompiledAgents(fakeHome),
        "a project uninstall must not rewrite the global compiled agents",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        (await listFiles(skillsPath(fakeHome))).sort(),
        "a project uninstall must not remove globally installed skills",
      ).toStrictEqual(globalSkillsBefore);
      // The one intended change, stated exactly rather than tolerated: the
      // project deregisters itself so future global edits stop propagating into
      // a directory that no longer has an installation. Comparing the whole
      // config against the before-state with only that field moved is what makes
      // this both the "nothing else changed" assertion and the proof that the
      // deregistration path fired at all.
      expect(
        await loadConfigOrFail(fakeHome),
        "a project uninstall must deregister the project and change nothing else in the global config",
      ).toStrictEqual({ ...globalConfigBefore, projects: [] });
      expect(
        await readTestFile(configTypesTsPath(fakeHome)),
        "a project uninstall must leave the global config-types.ts byte-identical",
      ).toBe(globalTypesBefore);
    },
  );

  it(
    "still removes a real install whose config.ts has been corrupted",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const testEnv = await createTestEnvironment();
      tempDir = testEnv.tempDir;
      const { fakeHome } = testEnv;

      const install = await initGlobalWithEject(E2E_SOURCE, fakeHome);
      expect(install.exitCode, `global init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);
      expect((await listFiles(skillsPath(fakeHome))).length).toBeGreaterThan(0);
      const agentsBeforeUninstall = await readCompiledAgents(fakeHome);
      expect(Object.keys(agentsBeforeUninstall).length).toBeGreaterThan(0);

      // A file the user wrote, in among the ones `init` compiled. It is the control for the
      // sweep below: with no config to consult, "removed everything in the directory" and
      // "removed what this CLI compiled" are the same claim until one file is neither.
      await writeAgentFile(fakeHome, HAND_WRITTEN_AGENT, { frontmatter: true });
      const handWrittenFile = path.join(agentsPath(fakeHome), `${HAND_WRITTEN_AGENT}.md`);
      const handWrittenBefore = await readTestFile(handWrittenFile);

      // The state a user most needs to uninstall from, reached the way they reach
      // it: a real installation whose config stopped loading.
      await writeCorruptConfig(fakeHome, SYNTAX_ERROR);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // The manifest and the ejected skills still go, which is the whole reason
      // the command tolerates the fault instead of aborting.
      expect(await fileExists(configTsPath(fakeHome))).toBe(false);
      expect(await fileExists(configTypesTsPath(fakeHome))).toBe(false);
      expect(await directoryExists(path.join(fakeHome, DIRS.CLAUDE_SRC))).toBe(false);
      await expect({ dir: fakeHome }).toHaveNoLocalSkills();

      // And so do the compiled agents, which the config is no longer needed to name: `init`
      // compiled every one of them, so every one carries the provenance marker, and the plan
      // claims them on that authority instead of the config's. The degradation this used to
      // pin — agent files left behind referencing skills that are gone — is what the marker
      // was added to end.
      //
      // Both halves are asserted against the plan the user was shown as well as against disk,
      // because the plan is the promise and the files are only the outcome: it names the
      // compiled agents under the removals AND names the one it is leaving, with the reason.
      expect(output).toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
      expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
      expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
      expect(
        Object.keys(await readCompiledAgents(fakeHome)).sort(),
        "an unreadable config no longer strands the agents this CLI compiled, and never claimed the one it did not",
      ).toStrictEqual([`${HAND_WRITTEN_AGENT}.md`]);
      expect(await readTestFile(handWrittenFile)).toBe(handWrittenBefore);
    },
  );
});
