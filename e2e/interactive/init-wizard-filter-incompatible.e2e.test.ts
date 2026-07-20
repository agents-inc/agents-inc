import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

/**
 * Tests for the F hotkey (filter incompatible) also deselecting incompatible skills.
 * Uses a custom source that includes Vue framework + pinia (Vue-only) alongside
 * React + zustand (React-compatible) with compatibleWith rules to verify that
 * pressing F with React selected deselects pinia.
 */

describe("init wizard — filter incompatible deselection", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource({
      relationships: {
        compatibleWith: [
          {
            skills: [E2E_SKILL.zustand.slug, E2E_SKILL.react.slug],
            reason: "Zustand works with React",
          },
          {
            skills: [E2E_SKILL.pinia.slug, E2E_SKILL["vue-composition-api"].slug],
            reason: "Pinia works with Vue",
          },
        ],
      },
    });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should deselect incompatible skills when enabling filter",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launch({ source });

      // Select stack (pre-selects React framework + zustand)
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Navigate to client-state category (Tab)
      await build.navigateToNextCategory();

      // Select pinia (navigates to its column in the grid and presses Space)
      await build.selectSkill(E2E_SKILL.pinia.slug);

      // Verify pinia appears on screen
      const output = build.getOutput();
      expect(output).toContain(E2E_SKILL.pinia.slug);

      // Press F to enable filter incompatible — pinia should be deselected and hidden
      await build.toggleFilterIncompatible();

      // After filtering: pinia should no longer be visible (filtered out)
      const afterFilter = build.getOutput();
      expect(afterFilter).not.toContain(E2E_SKILL.pinia.slug);

      // zustand should still be visible (compatible with React)
      expect(afterFilter).toContain(E2E_SKILL.zustand.slug);

      // Press F again to disable filter — pinia should reappear but NOT be selected
      await build.toggleFilterIncompatible();

      const afterUnfilter = build.getOutput();
      // Pinia should be visible again
      expect(afterUnfilter).toContain(E2E_SKILL.pinia.slug);
    },
  );
});
