import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
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
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * Eject-to-plugin over a marketplace with no `.claude-plugin/marketplace.json`: `edit --from`'s
 * load refuses before any migration, so the ejected copy survives byte-for-byte, the config is not
 * rewritten and the run does not exit clean. At a terminal, since without one `edit --from` refuses
 * first.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const TO_PLUGIN_ID = "ToPlugin1";

describe.skipIf(!claudeAvailable)("edit: eject -> plugin migration without a marketplace", () => {
  let unbuilt: E2ESource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    // A source with no marketplace.json: the marketplace the load refuses.
    unbuilt = await createE2ESource({ unbuilt: true });
    store = await startSeedConfigStore();
    store.publish(
      TO_PLUGIN_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { on: true, scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(unbuilt);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
  });

  it(
    "should hard-error and preserve the ejected skill instead of deleting it",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: unbuilt.sourceDir,
        skills: [E2E_SKILL.react.id],
        agents: [...E2E_AGENTS.WEB],
        domains: ["web"],
      });

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

      prompt = new InteractivePrompt(["edit", "--from", TO_PLUGIN_ID], project.dir, {
        ...TERMINAL_SIZE.TALL,
        env: { AGENTS_INC_API_URL: store.url },
      });
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(
        flattenCliOutput(prompt.getOutput()),
        "a marketplace with no marketplace.json must be refused, naming the builds that write one",
      ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);

      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
      expect(
        await readTestFile(skillMdPath),
        "SKILL.md of an eject skill must survive a run that cannot install it as a plugin",
      ).toStrictEqual(skillMdBefore);
      expect(await readTestFile(metadataPath)).toStrictEqual(metadataBefore);

      expect(exitCode, "a marketplace nothing can install from must hard-error, not warn").toBe(
        EXIT_CODES.ERROR,
      );

      // Must not claim a plugin source for a skill never plugin-installed.
      expect(
        await readTestFile(configPath),
        "config.ts must not record a plugin source for a skill that was never plugin-installed",
      ).toStrictEqual(configBefore);
    },
  );
});
