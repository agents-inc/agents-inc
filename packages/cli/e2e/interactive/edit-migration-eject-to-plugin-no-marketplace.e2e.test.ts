import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  configTsPath,
  flattenCliOutput,
  isClaudeCLIAvailable,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  EXIT_CODES,
  FILES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  TIMEOUTS,
} from "../pages/constants.js";
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
 *
 * The marketplace that reached it — a local directory with no
 * `.claude-plugin/marketplace.json` — is now refused by `edit`'s load, before the
 * wizard (owner ruling 2026-10-02: a custom marketplace must carry a valid
 * manifest), so no migration can be asked for over it. What is held is unchanged:
 * the ejected copy survives byte-for-byte, the config is not rewritten, and the run
 * does not exit clean. Run without a terminal, because the refusal lands before the
 * wizard mounts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit: eject -> plugin migration without a marketplace", () => {
  let unbuilt: E2ESource;

  beforeAll(async () => {
    // A source directory with NO .claude-plugin/marketplace.json — the marketplace the load refuses.
    unbuilt = await createE2ESource({ unbuilt: true });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(unbuilt);
  });

  it(
    "should hard-error and preserve the ejected skill instead of deleting it",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      // Eject-mode project reading from the unbuilt marketplace.
      const project = await ProjectBuilder.editable({
        marketplace: unbuilt.sourceDir,
        skills: [E2E_SKILL.react.id],
        agents: [...E2E_AGENTS.WEB],
        domains: ["web"],
      });

      // State that must survive the refusal untouched.
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

      const { exitCode, output } = await CLI.run(["edit"], project);

      expect(
        flattenCliOutput(output),
        "a marketplace with no marketplace.json must be refused, naming the builds that write one",
      ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);

      // Filesystem: the ejected working copy and its contents must be intact.
      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(
        await readTestFile(skillMdPath),
        "SKILL.md of an eject skill must survive a run that cannot install it as a plugin",
      ).toStrictEqual(skillMdBefore);
      expect(await readTestFile(metadataPath)).toStrictEqual(metadataBefore);

      expect(exitCode, "a marketplace nothing can install from must hard-error, not warn").toBe(
        EXIT_CODES.ERROR,
      );

      // Config: must not be rewritten to claim a plugin source for a skill
      // that was never plugin-installed.
      expect(
        await readTestFile(configPath),
        "config.ts must not record a plugin source for a skill that was never plugin-installed",
      ).toStrictEqual(configBefore);
    },
  );
});
