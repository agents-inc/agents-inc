import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  configTsPath,
  isClaudeCLIAvailable,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Eject -> plugin mode migration when no marketplace can be resolved.
 *
 * `executeMigration` deletes the ejected working copy of every `toPlugin`
 * skill before it checks whether a marketplace exists, then downgrades the
 * missing marketplace to a warning. `edit`'s `applyMigrations` only re-emits
 * those warnings, so the command exits 0 and `writeConfigAndCompile` persists
 * a plugin `source` for a skill that was deleted from disk and never
 * plugin-installed — the exact plugin-to-eject silent-substitution class the
 * newly-added-skill path already hard-errors on.
 *
 * The ejected copy is the user's editable working tree: destroying it discards
 * any hand edits with no way back.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit: eject -> plugin migration without a marketplace", () => {
  let localSource: E2ESource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    // A plain source directory with NO .claude-plugin/marketplace.json — the
    // marketplace resolution failure point.
    localSource = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(localSource);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should hard-error and preserve the ejected skill instead of deleting it",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      // Eject-mode project with no `marketplace` field in config.ts.
      const project = await ProjectBuilder.editable({
        marketplace: localSource.sourceDir,
        skills: [E2E_SKILL.react.id],
        agents: [...E2E_AGENTS.WEB],
        domains: ["web"],
      });

      // State that must survive a failed migration untouched.
      const configPath = configTsPath(project.dir);
      const skillMdPath = path.join(skillsPath(project.dir), E2E_SKILL.react.id, FILES.SKILL_MD);
      const metadataPath = path.join(
        skillsPath(project.dir),
        E2E_SKILL.react.id,
        FILES.METADATA_YAML,
      );
      const configBefore = await readTestFile(configPath);
      const skillMdBefore = await readTestFile(skillMdPath);
      const metadataBefore = await readTestFile(metadataPath);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: localSource,
        ...TERMINAL_SIZE.TALL,
      });

      // Build -> Sources (customize view), then switch every skill to plugin
      // mode. The single installed skill is currently eject-sourced, so this
      // produces a toPlugin migration with no marketplace available.
      const sources = await wizard.build.advanceToSources();
      await sources.setAllPlugin();

      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirmExpectingExit();

      // Filesystem: the ejected working copy and its contents must be intact.
      // A migration that cannot complete must destroy nothing.
      await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(
        await readTestFile(skillMdPath),
        "SKILL.md of an eject skill must survive a migration that cannot install it as a plugin",
      ).toStrictEqual(skillMdBefore);
      expect(await readTestFile(metadataPath)).toStrictEqual(metadataBefore);

      expect(
        await result.exitCode,
        "unresolvable marketplace on an eject -> plugin migration must hard-error, not warn",
      ).toBe(EXIT_CODES.ERROR);

      // Config: must not be rewritten to claim a plugin source for a skill
      // that was never plugin-installed.
      expect(
        await readTestFile(configPath),
        "config.ts must not record a plugin source for a skill that was never plugin-installed",
      ).toStrictEqual(configBefore);
    },
  );
});
