import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createGlobalOnlyEnv,
  readSkillBadgesViaEdit,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * D-223 — Wizard scope indicator missing for tombstoned global skills.
 *
 * Covers the visible-UI side of the dual-scope-badge regression (Manifestation 1
 * in the plan). The companion persistence coverage (Manifestation 2) lives in
 * `edit-wizard-excluded-skills.e2e.test.ts` via the inline-seeded
 * "should preserve both tombstone and active entry after no-op edit with dual
 * entries" test. This file adds the CLI-driven end-to-end flow that starts from
 * a real global install, performs a G→P scope toggle, re-opens `cc edit`, and
 * asserts BOTH scope badges render for the dual-scope skill row.
 *
 * Root cause (confirmed on current main): `populateFromSkillIds` in
 * `src/cli/stores/wizard-store.ts` drops the excluded tombstone via a
 * `!resolvedSet.has(sc.id)` filter clause when the same skill ID also has an
 * active entry in the saved config. The render layer (SkillTag) already paints
 * a secondary badge when `CategoryOption.secondaryScope` is set, and
 * `buildCategoriesForDomain` already computes that field when both entries are
 * present — the bug is strictly upstream in the hydrator.
 *
 * All three scenarios below are expected to FAIL on `main` until the hydrator
 * is fixed. They exercise the real `cc init`/`cc edit` user flow end-to-end —
 * no manual writes to `config.ts` or skill files.
 */

describe("edit wizard — dual-scope indicator after G→P toggle", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "Scenario A: re-opened wizard shows BOTH P and G badges for a dual-scope skill",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1: install all E2E skills globally, then bootstrap an all-global project.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Phase 2: toggle react G→P via a real `cc edit` run. After this, the
      // project's config.ts holds the dual-scope shape: active project entry +
      // global excluded tombstone.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // Phase 3: re-open the wizard. On `main`, the hydrator drops the tombstone,
      // so only a single badge renders. Expected after fix: BOTH badges visible.
      // The helper aborts without writing anything — scenario A is strictly a
      // read-path check.
      const badges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        sourceDir,
        sourceTempDir,
        E2E_SKILL.react.display,
      );

      // Strict: primary = active project scope, secondary = excluded global tombstone.
      expect(badges).toStrictEqual(["P", "G"]);
    },
  );

  it(
    "Scenario B: dual-scope badge survives a no-op edit round-trip",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1 + 2 (same as A): establish the dual-scope config on disk.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // Phase 3: open the wizard, pass through every step without changes,
      // let the CLI re-save. On `main`, the hydrator drops the tombstone on
      // load, so the re-save path writes a config that no longer contains it.
      const passThroughWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        const result = await passThroughWizard.passThrough();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await passThroughWizard.destroy();
      }

      // Phase 4: open the wizard AGAIN. If phase 3's no-op edit preserved the
      // tombstone, both badges should still render. On `main`, the tombstone
      // is lost after phase 3, so only a single badge renders.
      const badges = await readSkillBadgesViaEdit(
        projectDir,
        fakeHome,
        sourceDir,
        sourceTempDir,
        E2E_SKILL.react.display,
      );
      expect(badges).toStrictEqual(["P", "G"]);
    },
  );

  it(
    "Scenario C: filesystem + config remain dual-scope after a no-op re-open",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Phase 1 + 2: establish dual-scope state via real CLI flows.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      const projectConfigPath = configTsPath(projectDir);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);

      // Sanity check: the toggle produced the expected dual-scope config on disk.
      // This state is already correct on `main` (config writer is D-221-clean).
      const configAfterToggle = await readTestFile(projectConfigPath);
      expect(configAfterToggle).toContain(`"id":"${E2E_SKILL.react.id}"`);
      expect(configAfterToggle).toContain('"scope":"project"');
      expect(configAfterToggle).toContain('"scope":"global"');
      expect(configAfterToggle).toContain('"excluded":true');

      // Phase 3: open the wizard and complete it with zero changes. On `main`
      // the hydrator drops the tombstone during this pass, so the re-saved
      // config loses the `{scope:"global", excluded:true}` entry.
      const passThroughWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        const result = await passThroughWizard.passThrough();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await passThroughWizard.destroy();
      }

      // Phase 4: the config on disk MUST still carry both entries. Load the
      // config structurally to isolate the react entries and compare shapes
      // instead of relying on substring containment.
      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);

      const activeEntry = reactEntries.find((entry) => entry.excluded !== true);
      const tombstoneEntry = reactEntries.find((entry) => entry.excluded === true);

      expect(activeEntry, "active project entry must survive no-op edit").toBeDefined();
      expect(tombstoneEntry, "global excluded tombstone must survive no-op edit").toBeDefined();
      expect(activeEntry?.scope).toBe("project");
      expect(tombstoneEntry?.scope).toBe("global");
      expect(tombstoneEntry?.excluded).toBe(true);

      // Phase 5: physical presence — react must exist at BOTH scope paths.
      // The global copy is untouched by G→P (additive override model); the
      // project copy was created by the phase-2 toggle.
      expect(
        await directoryExists(globalSkillDir),
        `react must still be physically installed at ${globalSkillDir} (global is untouched by G→P)`,
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        `react must be physically copied to ${projectSkillDir} after G→P toggle`,
      ).toBe(true);

      // Both config-side matchers still hold — the project config advertises
      // react as a top-level skill and the global config retains it too.
      await expect({ dir: projectDir }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
      await expect({ dir: fakeHome }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
    },
  );
});
