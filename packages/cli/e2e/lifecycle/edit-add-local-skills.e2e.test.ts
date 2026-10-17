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
 * `edit --from` switching a plugin skill to `source: "eject"` copies it into `.claude/skills/`.
 * Requires the Claude CLI.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const COMPILED_AGENT_FILES = E2E_STACK_AGENTS.map((agent) => `${agent}.md`);

const PLUGIN_STACK_ID = "PlugStk3";

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

      // Default-scope skills are global, so both phases edit the global install (HOME === cwd).

      const initResult = await runInitFrom(
        store,
        PLUGIN_STACK_ID,
        { dir: projectDir },
        fixture.sourceDir,
      );
      expect(initResult.exitCode, initResult.output).toBe(EXIT_CODES.SUCCESS);

      const configPath = configTsPath(projectDir);
      expect(await fileExists(configPath)).toBe(true);
      const configAfterInit = await readTestFile(configPath);
      expect(configAfterInit).not.toContain("origin: 'eject'");

      const editResult = await applyEditFrom(store, REACT_EJECTED_ID, { dir: projectDir });
      expect(editResult.exitCode, editResult.output).toBe(EXIT_CODES.SUCCESS);

      const configAfterEdit = await readTestFile(configPath);
      expect(configAfterEdit).toContain("origin: 'eject'");

      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(Object.keys(await readCompiledAgents(projectDir)).sort()).toStrictEqual(
        COMPILED_AGENT_FILES,
      );
    },
  );
});
