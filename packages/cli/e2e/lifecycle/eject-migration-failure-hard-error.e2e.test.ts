import path from "path";
import { chmod, rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupFixture, configTsPath, readTestFile, skillsPath } from "../helpers/test-utils.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import type { WizardResult } from "../pages/wizard-result.js";
import { DIRS, E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * The eject half of the contract `plugin-install-failure-hard-error.e2e.test.ts` pins for
 * the plugin half: a mode migration that could NOT do the work the user asked for must
 * refuse to record it.
 *
 * Pre-fix, `executeMigration` pushed `Could not copy skills for eject: …` into `warnings`
 * and `applyMigrations` only LOGGED them, so `writeConfigAndCompile` went on to write
 * `origin: "eject"` rows for skills that never copied — the orphan-entry state CLAUDE.md
 * already rules out for the plugin direction — and the command exited 0. The config write
 * itself had the same shape one layer down: a `writeProjectConfig` throw became
 * `Could not update config: …` and the run continued into the agent recompile, leaving the
 * plugin registry, `config.ts` and `.claude/agents/` mutually inconsistent behind a success
 * banner.
 *
 * WHICH ASSERTION CARRIES THE RED, and how each was watched go red.
 *
 *  - Test one: the exit code, pre-fix and under a `this.warn` in place of the hard-error.
 *    The exit code is NOT the assertion that matters, though — a fix that errors and still
 *    lets the write happen satisfies it. The config pair was watched separately, with the
 *    exit assertion temporarily removed so the run reached it: pre-fix `config.ts` held
 *    `"origin":"eject"` for the skill whose copy the destination had refused, which is the
 *    orphan row this spec exists for.
 *  - Test two: the exit code under a `this.warn`, and — the more informative one — the
 *    `Could not update config` assertion when the skills directory is locked as well. That
 *    mutation still exits 1, for a failure one step earlier, so the exit code alone cannot
 *    tell this test's subject from the previous test's. `toHaveSkillCopied` is the proof
 *    that the run reached the config write at all.
 *  - Test three: the `not.toContain` on the copy wording. That run SUCCEEDS both before and
 *    after and only the sentence changes, so nothing else here can carry it.
 *
 * WHY THE INSTALLED COPY IS DELETED BEFORE EACH RUN, and why that is not a tidy-up.
 * `ProjectBuilder.pluginProject` writes a directory under `.claude/skills/<id>` for every
 * skill it declares, but a genuinely plugin-installed skill has no copy there
 * (`e2e/fixtures/plugin-install-state.ts`: "Plugin mode never copies skills into
 * `.claude/skills/`"). Left in place it is ALSO the destination the eject migration resolves,
 * so `copySkillsToLocalFlattened` takes its source-equals-destination shortcut and performs
 * no write at all. Measured: with the `rm` disabled, test one exits 0 against the fixed
 * binary — the read-only destination is never touched, and the whole spec is vacuous.
 *
 * The lever is a read-only directory, as in `commands/eject.e2e.test.ts`. It is a no-op for
 * a run as root, where the failures these tests assert on cannot be provoked; the exit-code
 * assertions are what would report that, rather than the spec passing quietly.
 *
 * No Claude CLI required: `executeMigration` copies before it attempts the plugin uninstall,
 * and the uninstall is diagnostic-only.
 */

/** Denies the write bit while leaving the directory readable and traversable. */
const READ_ONLY_DIR = 0o555;
/** The mode a fixture directory is built with, restored so cleanup can remove the tree. */
const WRITABLE_DIR = 0o755;

/**
 * A PATH carrying node and the standard bin directories but deliberately no `claude`, so
 * `claudePluginUninstall` fails with `spawn claude ENOENT` whether or not the machine
 * running the suite has the binary installed.
 */
const PATH_WITHOUT_CLAUDE = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":");

describe("an eject migration that could not do its work must not report success", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;
  let lockedDirs: string[] = [];

  beforeAll(async () => {
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    for (const dir of lockedDirs) {
      await chmod(dir, WRITABLE_DIR);
    }
    lockedDirs = [];
  });

  /** Builds a plugin-mode install whose skill has no local copy, as a real plugin install has. */
  async function pluginInstallWithNoLocalCopy(): Promise<{ dir: string }> {
    const project = await ProjectBuilder.pluginProject({
      skills: [E2E_SKILL.react.id],
      marketplace: source.sourceDir,
      marketplaceName: E2E_MARKETPLACE_NAME,
      agents: [...E2E_AGENTS.WEB],
      domains: ["web"],
    });
    await rm(path.join(skillsPath(project.dir), E2E_SKILL.react.id), { recursive: true });
    return project;
  }

  /** Drives the Sources step to switch every editable row to a local copy, then saves. */
  async function switchAllToLocalExpectingExit(projectDir: string): Promise<WizardResult> {
    wizard = await EditWizard.launch({ projectDir, source });
    const sources = await wizard.build.advanceToSources();
    await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    return confirm.confirmExpectingExit();
  }

  it(
    "exits non-zero and writes no eject origin when the destination skills directory is unwritable",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();
      const configPath = configTsPath(project.dir);
      const configBefore = await readTestFile(configPath);

      const destination = skillsPath(project.dir);
      await chmod(destination, READ_ONLY_DIR);
      lockedDirs.push(destination);

      const result = await switchAllToLocalExpectingExit(project.dir);

      expect(await result.exitCode).toBe(EXIT_CODES.ERROR);

      const output = result.output;
      expect(output).toContain("Eject intent could not be honored");
      expect(output).toContain(E2E_SKILL.react.id);

      // The half an exit-code-only assertion cannot see: a fix that errors but still lets
      // the write happen leaves config.ts claiming a local copy that is not on disk.
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: E2E_MARKETPLACE_NAME,
      });
      expect(await readTestFile(configPath)).toStrictEqual(configBefore);
      await expect(result.project).not.toHaveSkillCopied(E2E_SKILL.react.id);
    },
  );

  it(
    "exits non-zero when the config directory is unwritable at the config write",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();

      const configDir = path.join(project.dir, DIRS.CLAUDE_SRC);
      await chmod(configTsPath(project.dir), READ_ONLY_DIR);
      await chmod(configDir, READ_ONLY_DIR);
      lockedDirs.push(configDir, configTsPath(project.dir));

      const result = await switchAllToLocalExpectingExit(project.dir);

      expect(await result.exitCode).toBe(EXIT_CODES.ERROR);
      expect(result.output).toContain("Could not update config");

      // Proof of execution: the migration itself succeeded, so the run reached the config
      // write rather than failing earlier for the reason the first test covers.
      await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
    },
  );

  it(
    "reports a failed plugin uninstall as an uninstall, not as a failed copy",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await pluginInstallWithNoLocalCopy();

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source,
        env: { PATH: PATH_WITHOUT_CLAUDE },
      });
      const sources = await wizard.build.advanceToSources();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      // The copy is the work; the uninstall is diagnostic-only, so the run still succeeds.
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const output = result.output;
      // The subject guard for the negative below: the copy pass ran and reported its count,
      // so a sentence about copying failing would be a claim about work that succeeded.
      expect(output).toContain(
        `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX}`,
      );
      expect(output).toContain("Could not uninstall plugin for");
      expect(output).toContain(E2E_SKILL.react.id);
      expect(output).not.toContain("Could not copy skills for eject");

      await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: "eject",
      });
    },
  );
});
