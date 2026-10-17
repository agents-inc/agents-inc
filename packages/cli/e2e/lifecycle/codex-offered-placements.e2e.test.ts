import { readdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { readCodexPrompt, runCodex } from "../fixtures/codex.js";
import {
  CODEX_OFFERED_CELLS,
  CODEX_REFUSED_CELL,
  codexGlobalSkillsDir,
  codexProjectSkillsDir,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  listFiles,
} from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";

/**
 * Codex's three offered placements and the refused fourth. Each offered one is pinned on disk and
 * in the prompt the pinned binary would send (`readCodexPrompt`), since Codex may ignore a path.
 * The probe writes, so filesystem assertions come first. `plugin + project` is refused beside
 * `plugin + global` installing.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Pinned to the project so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** Without the root's index: Codex numbers roots by arrival order, which varies between runs. */
function skillRootLine(absolute: string): string {
  return `= \`${absolute}\``;
}

/** An ejected skill's own name, or `<plugin>:<skill>` for a plugin's. */
function availableSkillLine(name: string): string {
  return `- ${name}: `;
}

describe("the placements a Codex installation offers", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "plugin + global registers the plugin with Codex, and Codex reads the skill out of its cache",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const reactRef = buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName);
      store.publish(
        "CdxPlgGl",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxPlgGl",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      // Read with the pinned binary: an invented registry entry would satisfy a file assertion.
      const listed = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
      expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(JSON.stringify(listed.json)).toContain(reactRef);

      // A plugin skill is never copied. `$CODEX_HOME/skills` is not asserted absent: Codex plants
      // its `.system` bundle there whenever it first reads a prompt.
      expect(await directoryExists(codexProjectSkillsDir(env.projectDir))).toBe(false);

      const prompt = await readCodexPrompt(env.fakeHome, env.projectDir);
      expect(prompt).toContain(availableSkillLine(`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`));
    },
  );

  it(
    "eject + global copies the skill to $CODEX_HOME/skills, which is a root Codex reads",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxEjGl0",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxEjGl0",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      // Before the prompt probe, which lays Codex's `.system` bundle down here.
      const globalSkills = codexGlobalSkillsDir(env.fakeHome);
      expect(await listFiles(globalSkills)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await fileExists(path.join(globalSkills, E2E_SKILL.react.id, FILES.SKILL_MD))).toBe(
        true,
      );

      // `~/.agents/skills` also reaches the model, but that namespace is not this product's.
      expect(await directoryExists(path.join(env.fakeHome, ".agents", "skills"))).toBe(false);

      const prompt = await readCodexPrompt(env.fakeHome, env.projectDir);
      expect(prompt).toContain(skillRootLine(globalSkills));
      expect(prompt).toContain(availableSkillLine(E2E_SKILL.react.id));
    },
  );

  it(
    "eject + project commits the skill to <repo>/.agents/skills, read in that repo and nowhere else",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxEjPr0",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxEjPr0",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      const projectSkills = codexProjectSkillsDir(env.projectDir);
      expect(await listFiles(projectSkills)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await fileExists(path.join(projectSkills, E2E_SKILL.react.id, FILES.SKILL_MD))).toBe(
        true,
      );

      // Not a root Codex reads; one path segment from the one above, so asserted.
      expect(await directoryExists(path.join(env.projectDir, "skills"))).toBe(false);

      // No plugin, marketplace, trust entry or global config file.
      const insideTheRepo = await readCodexPrompt(env.fakeHome, env.projectDir);
      expect(insideTheRepo).toContain(skillRootLine(projectSkills));
      expect(insideTheRepo).toContain(availableSkillLine(E2E_SKILL.react.id));

      const outsideTheRepo = await readCodexPrompt(env.fakeHome, env.fakeHome);
      expect(outsideTheRepo).not.toContain(availableSkillLine(E2E_SKILL.react.id));
    },
  );

  it(
    "plugin + project is refused, naming the three it offers, before anything is written",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxPlgPr",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxPlgPr",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);

      expect(exitCode, said).not.toBe(EXIT_CODES.SUCCESS);
      // The message names every cell it could have been asked for instead.
      expect(said).toContain(E2E_SKILL.react.id);
      expect(said).toContain(CODEX_REFUSED_CELL);
      for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

      // Never falls back to eject: the refusal writes nothing at all.
      expect(await directoryExists(codexProjectSkillsDir(env.projectDir))).toBe(false);
      expect(await directoryExists(codexGlobalSkillsDir(env.fakeHome))).toBe(false);
      expect(await directoryExists(path.join(env.projectDir, ".agents-inc"))).toBe(false);
      expect(await directoryExists(path.join(env.fakeHome, ".agents-inc"))).toBe(false);

      const listed = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
      expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(listed.json).toStrictEqual([{ installed: [], available: [] }]);
    },
  );

  it(
    "offers plugin + project on Claude, which is what makes the Codex refusal a refusal",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "ClaPlgPr",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const { exitCode, output } = await runInitFrom(
        store,
        "ClaPlgPr",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      const said = flattenCliOutput(output);

      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
      expect(said).not.toContain(CODEX_REFUSED_CELL);
      // Same cell, same skill, other host: the refusal is not a guard that swallowed plugin mode.
      expect((await readdir(path.join(env.projectDir, ".agents-inc"))).sort()).toStrictEqual([
        "claude",
      ]);
    },
  );
});
