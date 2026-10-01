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
 * The three placements a Codex installation offers, the fourth it refuses, and — for each of the
 * three — that Codex itself can see what the install wrote.
 *
 * **Two assertions per placement, and neither one alone is the claim.** Where the file landed is
 * this CLI's decision and a spec can read it off disk; whether Codex READS that location is
 * Codex's decision and only Codex can answer it. A placement that writes to a directory Codex
 * ignores passes every filesystem assertion and delivers nothing — which is exactly how the first
 * version of this plan came to say a project skill was a degraded fallback, and how it came to say
 * a project role file never registers. So each offered cell is pinned twice: `SKILL.md` is at the
 * path, and the skill's own name is in the prompt the pinned binary would send.
 *
 * **The instrument is `codex debug prompt-input` through `readCodexPrompt`**, run under the same
 * pinned `HOME` and `CODEX_HOME` the install used. Nothing else can answer the question: `plugin
 * list --json` is about the registry, not about what reaches the model, and no `--json`
 * subcommand prints the skills block at all.
 *
 * **The probe WRITES, so every filesystem assertion is taken before it.** Re-derived on 0.155.1,
 * 2026-09-22: a `debug prompt-input` under an empty `CODEX_HOME` leaves `installation_id`,
 * `.sandbox_migration`, `shell_snapshots/` and — the one that would silently break a listing —
 * `skills/.system`, Codex's own bundled skills, inside the very directory `eject + global` writes
 * to. It writes no `config.toml`, so it grants no trust: the file is absent after it, which is
 * what keeps the three placements' claims independent of the trust gate.
 *
 * **Each refusal is paired with an allowed case in this file.** A refusal on its own cannot tell a
 * correctly-scoped guard from one that has swallowed its whole domain — both leave the tree
 * unchanged and both exit non-zero — so `plugin + project` is refused in the same file where
 * `plugin + global` installs.
 *
 * Written before `codex-host.ts`, the `--provider` flag and the refusal existed, and red on the
 * unknown flag until C4b built them. Green since 2026-09-22 against the pinned 0.155.1, which
 * `e2e/fixtures/codex-on-path.ts` puts on the spawned CLI's `PATH`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry keeping its agent in the project, so a skill's scope is the only variable. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * The line Codex's skills block writes a root as, for one absolute path.
 *
 * The root's INDEX is deliberately not part of it. Codex numbers its roots `r0`, `r1`, … in
 * whatever order they appear, and the same root took two different numbers in two runs an hour
 * apart on 0.155.1 — `$CODEX_HOME/skills` was `r0` in a home that had one and `r1` was the plugin
 * cache in a home that did not. Pinning a number pins the arrangement of every OTHER root.
 */
function skillRootLine(absolute: string): string {
  return `= \`${absolute}\``;
}

/** How the skills block names one skill: its own name for an ejected one, `<plugin>:<skill>` for a plugin's. */
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

      // Codex's own registry, read with the pinned binary rather than from a file this CLI wrote:
      // a registry entry the CLI invented would satisfy a file assertion and install nothing.
      const listed = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
      expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(JSON.stringify(listed.json)).toContain(reactRef);

      // A plugin skill is registered, never copied: the project skills directory the eject
      // placements write to is not created at all.
      //
      // Only that one. `$CODEX_HOME/skills` is NOT asserted absent here and the omission is
      // deliberate: it is a directory Codex plants its own `.system` bundle in the first time it
      // reads a prompt, so an absence there would be a claim about which of our own commands has
      // started the binary — a fact about this test's order rather than about the placement.
      expect(await directoryExists(codexProjectSkillsDir(env.projectDir))).toBe(false);

      // And it reaches the model, under the name a plugin's skill carries there.
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

      // Read before the prompt probe below: `$CODEX_HOME/skills/` is shared with the host itself,
      // and the probe lays Codex's own `.system` bundle down in it the first time it runs.
      const globalSkills = codexGlobalSkillsDir(env.fakeHome);
      expect(await listFiles(globalSkills)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await fileExists(path.join(globalSkills, E2E_SKILL.react.id, FILES.SKILL_MD))).toBe(
        true,
      );

      // `~/.agents/skills` also reaches the model and is NOT where this goes (D14): uninstall and
      // doctor must agree with one root, and that namespace is not this product's.
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

      // `<repo>/skills/` is NOT a root Codex reads. Nothing may ever write there, and the absence
      // is asserted rather than assumed because it is one path segment away from the one above.
      expect(await directoryExists(path.join(env.projectDir, "skills"))).toBe(false);

      // In THIS repo, with no plugin, no marketplace, no trust entry and no global config file.
      const insideTheRepo = await readCodexPrompt(env.fakeHome, env.projectDir);
      expect(insideTheRepo).toContain(skillRootLine(projectSkills));
      expect(insideTheRepo).toContain(availableSkillLine(E2E_SKILL.react.id));

      // And nowhere else: the same HOME, a directory outside the repo, and the skill is gone.
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
      // The skill it could not place, the cell it was asked for, and — the half that makes the
      // message usable — every cell it could have been asked for instead.
      expect(said).toContain(E2E_SKILL.react.id);
      expect(said).toContain(CODEX_REFUSED_CELL);
      for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

      // "Never fall back to eject" is KEPT, not overridden: the refusal writes nothing at all.
      // Both skills directories absent, no config pair at either scope, and Codex's registry
      // empty — an orphan config row claiming an install that never happened is the exact defect
      // `install-plugin-skills.ts`'s pre-flight exists against.
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
      // Nothing about this payload is unofferable — the same cell, the same skill, a different
      // host. Without this the refusal above could be a guard that has swallowed plugin mode.
      expect((await readdir(path.join(env.projectDir, ".agents-inc"))).sort()).toStrictEqual([
        "claude",
      ]);
    },
  );
});
