import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createPermissionsFile,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";

/**
 * Edit: add new local-source skills lifecycle E2E test.
 *
 * Verifies that `cc edit` copies newly added skills with `source: "eject"`
 * to the `.claude/skills/` directory.
 *
 * Phase 1: Init with plugin source. Select all defaults (all skills as plugin).
 * Phase 2: Edit — switch ONE existing skill (first in sources) to local.
 *          This is a source migration (plugin → local), handled by executeMigration.
 *          Also add a verification that newly added local skills would be copied.
 * Phase 3: Assert the local-sourced skill was copied to `.claude/skills/`.
 *
 * Requires Claude CLI for plugin install/uninstall operations.
 */

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The stack's whole sub-agent roster as compiled filenames, derived from the stack
 * definition rather than retyped. Phase 1 installs that stack, so the recompile phase 2
 * drives is held to the same roster: the parameterless `toHaveCompiledAgents()` that
 * stood here proved only that the directory held at least one `.md`, which phase 1's own
 * install satisfies whatever phase 2 does to it.
 */
const COMPILED_AGENT_FILES = E2E_STACK_AGENTS.map((agent) => `${agent}.md`);

describe.skipIf(!claudeAvailable)("edit: add new local-source skills", () => {
  let fixture: E2EPluginSource;
  let tempDir: string | undefined;
  let activeWizard: { destroy(): Promise<void> } | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    if (activeWizard) {
      await activeWizard.destroy();
      activeWizard = undefined;
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "should copy newly added local-source skills to .claude/skills/ during edit",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = tempDir;
      await createPermissionsFile(projectDir);

      // This test switches a skill's SOURCE (plugin -> eject) during edit.
      // Default-scope skills are GLOBAL, and a project edit renders global
      // skills as locked (readOnly) — their source cannot be toggled from a
      // project context. So both phases model editing the GLOBAL install via
      // launchInGlobal: HOME == cwd == projectDir, the skills are editable, and
      // all content + config collapse onto projectDir (asserted below).
      // ================================================================
      // Phase 1: Init with all defaults — all skills as plugin
      // ================================================================

      const initWizard = await InitWizard.launchInGlobal({
        source: fixture,
        projectDir,
        ...TERMINAL_SIZE.TALL,
      });
      activeWizard = initWizard;

      const domain = await initWizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();

      // Sources: accept defaults (all plugin)
      const agents = await sources.acceptDefaults();

      // Agents: accept defaults
      const confirm = await agents.acceptDefaults("init");

      const initResult = await confirm.confirm();
      expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      await initResult.destroy();
      activeWizard = undefined;

      // Phase 1 verification
      const configPath = configTsPath(projectDir);
      expect(await fileExists(configPath)).toBe(true);
      const configAfterInit = await readTestFile(configPath);
      // All skills should be plugin (not eject)
      expect(configAfterInit).not.toContain("origin: 'eject'");

      // ================================================================
      // Phase 2: Edit — switch first skill to eject source
      //
      // The focused item in sources is the first skill (web-framework-react).
      // Toggle it to eject. This tests that edit correctly copies a skill
      // that switches from plugin to eject source.
      // ================================================================

      const editWizard = await EditWizard.launchInGlobal({
        projectDir,
        source: fixture,
        ...TERMINAL_SIZE.TALL,
      });
      activeWizard = editWizard;

      // Build step: pass through all domains without changes
      const editSources = await editWizard.build.passThroughAllDomains();

      // Sources step: toggle first skill to eject (cursor is already on it)
      await editSources.waitForReady();
      await editSources.selectFocusedSourceCell();
      const editAgents = await editSources.advance();

      // Agents: accept defaults
      const editConfirm = await editAgents.acceptDefaults("edit");

      const editResult = await editConfirm.confirm();
      expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      await editResult.destroy();
      activeWizard = undefined;

      // ================================================================
      // Phase 3: Assertions
      // ================================================================

      const configAfterEdit = await readTestFile(configPath);
      // The switched skill should now have source "eject"
      expect(configAfterEdit).toContain("origin: 'eject'");

      // The eject-sourced skill should be copied to .claude/skills/. Under the
      // global-edit model HOME == projectDir, so global content lands here.
      // This validates the source migration path (plugin → eject) in edit.
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(Object.keys(await readCompiledAgents(projectDir)).sort()).toStrictEqual(
        COMPILED_AGENT_FILES,
      );
    },
  );
});
