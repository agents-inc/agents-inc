import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { DUAL_SCOPE, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, readTreeSnapshot } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * The panel is printed once as text, so a terminal shorter than the run's output (`SHORT` has fewer
 * rows than the screen pinned below) scrolls it like any other line: every box closes, every row
 * shows, and the question follows the bottom border with no count of lines hidden. Pinned whole,
 * so a panel drawn any other way reddens it: a built panel forced to print `3 more below` failed on
 * that one line. Its rows by scope are `init-from-lists-then-asks`'s subject.
 */

const PANEL_ID = "PanelWh1";

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

describe("init --from <id> at a terminal shorter than what it prints", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(PANEL_ID, e2eStackPayload(DUAL_SCOPE));
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Not HOME whole: the project sits inside it, and a load's cache is not an install. */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
    ]);
    return { project, home };
  }

  it(
    "prints the whole panel as boxes and asks under its bottom border, with nothing counted as hidden",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await createTestEnvironment();
      const before = await snapshotInstallSurfaces(env);

      prompt = new InteractivePrompt(
        ["init", "--from", PANEL_ID, "--marketplace", E2E_SOURCE.sourceDir],
        env.projectDir,
        { ...TERMINAL_SIZE.SHORT, env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome } },
      );
      await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
      expect(
        prompt.getOutput(),
        "init --from at a terminal must ask before it installs a shared configuration",
      ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

      await prompt.deny();
      expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);

      expect(prompt.getScreen()).toMatchInlineSnapshot(`
        "Fetching configuration PanelWh1...
        ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
        │  Marketplace All skills ejected                                                                  │
        │  Stack E2E Test Stack                                                                            │
        │                                                                                                  │
        │  ──────────────────────────────────────────────────────────────────────────────────────────────  │
        │                                                                                                  │
        │  Skills                                                       │  Agents                          │
        │                                                               │                                  │
        │   Project                                                     │   Project                        │
        │  + E2E Hono ⏏                                                 │  + api-developer                 │
        │                                                               │                                  │
        │   Global                                                      │   Global                         │
        │  + E2E React ⏏                 + E2E Vitest ⏏                 │  + web-developer                 │
        │  + E2E Zustand ⏏               + Reviewing ⏏                  │                                  │
        │  + CLI Reviewing ⏏             + Research Methodology ⏏       │                                  │
        └──────────────────────────────────────────────────────────────────────────────────────────────────┘

        Install this configuration?
        y/N
        Setup cancelled"
      `);
      expect(
        await snapshotInstallSurfaces(env),
        "a declined install writes nothing at either scope",
      ).toStrictEqual(before);
    },
  );
});
