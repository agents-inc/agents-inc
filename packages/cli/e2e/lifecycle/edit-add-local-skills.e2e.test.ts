import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
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
import { E2E_SKILL, E2E_STACK_AGENTS, E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";

/**
 * Edit: add new local-source skills lifecycle E2E test.
 *
 * Verifies that `cc edit --from` copies a skill switched to `source: "eject"`
 * to the `.claude/skills/` directory.
 *
 * Phase 1: Init with plugin source (all skills as plugin).
 * Phase 2: Edit — switch ONE existing skill to eject.
 *          This is a source migration (plugin → local), handled by executeMigration.
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

/** The stack, every skill a plugin. */
const PLUGIN_STACK_ID = "PlugStk3";

/** The same stack with react ejected. */
const REACT_EJECTED_ID = "PlugStk4";

describe.skipIf(!claudeAvailable)("edit: add new local-source skills", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
    store.publish(PLUGIN_STACK_ID, e2eStackPayload({ scope: "global", install: "plugin" }));
    store.publish(
      REACT_EJECTED_ID,
      e2eStackPayload({
        scope: "global",
        pluginSkills: E2E_STACK_SKILL_IDS.filter((id) => id !== E2E_SKILL.react.id),
      }),
    );
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
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
      // Default-scope skills are GLOBAL, so both phases edit the GLOBAL install:
      // HOME == cwd == projectDir, and all content + config collapse onto
      // projectDir (asserted below).
      // ================================================================
      // Phase 1: Init — all skills as plugin
      // ================================================================

      const initResult = await runInitFrom(
        store,
        PLUGIN_STACK_ID,
        { dir: projectDir },
        fixture.sourceDir,
      );
      expect(initResult.exitCode, initResult.output).toBe(EXIT_CODES.SUCCESS);

      // Phase 1 verification
      const configPath = configTsPath(projectDir);
      expect(await fileExists(configPath)).toBe(true);
      const configAfterInit = await readTestFile(configPath);
      // All skills should be plugin (not eject)
      expect(configAfterInit).not.toContain("origin: 'eject'");

      // ================================================================
      // Phase 2: Edit — switch react to eject source. This tests that edit
      // correctly copies a skill that switches from plugin to eject source.
      // ================================================================

      const editResult = await applyEditFrom(store, REACT_EJECTED_ID, { dir: projectDir });
      expect(editResult.exitCode, editResult.output).toBe(EXIT_CODES.SUCCESS);

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
